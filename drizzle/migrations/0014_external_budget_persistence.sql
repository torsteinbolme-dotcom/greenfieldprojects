-- Additive only. Existing scenario and financial-engine data are never rewritten.
CREATE TABLE public.external_budget (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  current_version_id uuid NOT NULL,
  archived_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id, project_id)
);
CREATE TABLE public.external_budget_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  action text NOT NULL CHECK (action IN ('create','save','refresh','duplicate','archive','restore')),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  description text CHECK (length(description) <= 4000),
  source_info jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source_info) = 'object'),
  input jsonb NOT NULL CHECK (jsonb_typeof(input) = 'object'),
  schema_version text NOT NULL CHECK (schema_version = 'external-budget-document-v1'),
  financial_contract_version text NOT NULL CHECK (financial_contract_version = 'financial-input-v1'),
  -- Historical identity, deliberately no FK to deletable scenario rows.
  source_scenario_id uuid,
  source_assumption_id uuid,
  source_assumption_version integer,
  source_calculation_version text,
  source_assumptions jsonb,
  duplicated_from_budget_id uuid,
  duplicated_from_version_id uuid,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (budget_id, organization_id, project_id)
    REFERENCES public.external_budget(id, organization_id, project_id) ON DELETE RESTRICT,
  UNIQUE (budget_id, version),
  UNIQUE (id, budget_id, organization_id, project_id),
  CHECK ((source_scenario_id IS NULL AND source_assumption_id IS NULL AND source_assumption_version IS NULL
    AND source_calculation_version IS NULL AND source_assumptions IS NULL)
    OR (source_scenario_id IS NOT NULL AND source_assumption_id IS NOT NULL AND source_assumption_version IS NOT NULL AND source_assumption_version > 0
    AND source_calculation_version IS NOT NULL AND source_assumptions IS NOT NULL AND jsonb_typeof(source_assumptions) = 'object')),
  CHECK ((duplicated_from_budget_id IS NULL) = (duplicated_from_version_id IS NULL)),
  CHECK ((input->>'version' = financial_contract_version AND input->>'mode' = 'externalBudget'
    AND input->>'status' IN ('draft','complete')) IS TRUE)
);
ALTER TABLE public.external_budget ADD CONSTRAINT external_budget_current_version_fk
  FOREIGN KEY (current_version_id, id, organization_id, project_id)
  REFERENCES public.external_budget_versions(id, budget_id, organization_id, project_id)
  DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX external_budget_project_idx ON public.external_budget(organization_id, project_id, archived_at);
CREATE INDEX external_budget_history_idx ON public.external_budget_versions(organization_id, budget_id, version DESC);
CREATE INDEX external_budget_source_idx ON public.external_budget_versions(source_assumption_id) WHERE source_assumption_id IS NOT NULL;

ALTER TABLE public.external_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_budget_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.external_budget, public.external_budget_versions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.external_budget, public.external_budget_versions TO authenticated, service_role;
CREATE POLICY external_budget_read ON public.external_budget FOR SELECT TO authenticated USING (
  auth.uid() IS NOT NULL AND public.is_org_member(organization_id, auth.uid())
  AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id
    AND p.organization_id = external_budget.organization_id AND p.deleted_at IS NULL)
);
CREATE POLICY external_budget_version_read ON public.external_budget_versions FOR SELECT TO authenticated USING (
  auth.uid() IS NOT NULL AND public.is_org_member(organization_id, auth.uid())
  AND EXISTS (SELECT 1 FROM public.external_budget b WHERE b.id = budget_id
    AND b.organization_id = external_budget_versions.organization_id AND b.project_id = external_budget_versions.project_id)
);

CREATE FUNCTION public.guard_external_budget_history() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_TABLE_NAME = 'external_budget_versions' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'External budget history is immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = NEW.project_id AND p.organization_id = NEW.organization_id AND p.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'Budget project and organization must match' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.organization_id, NEW.project_id, NEW.created_by, NEW.created_at)
    IS DISTINCT FROM (OLD.id, OLD.organization_id, OLD.project_id, OLD.created_by, OLD.created_at) THEN
    RAISE EXCEPTION 'External budget ownership is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_external_budget_history() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER external_budget_ownership BEFORE INSERT OR UPDATE OR DELETE ON public.external_budget
  FOR EACH ROW EXECUTE FUNCTION public.guard_external_budget_history();
CREATE TRIGGER external_budget_history_immutable BEFORE UPDATE OR DELETE ON public.external_budget_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_external_budget_history();

-- Trusted-server boundary: authenticated/anonymous callers cannot execute this RPC
-- or write either table. Server middleware verifies the caller; the server captures
-- inheritance and validates complete inputs with the approved TS financial engine.
-- Authorization, tenancy, CAS and source identity are independently rechecked here.
CREATE FUNCTION public.write_external_budget(
  _actor uuid, _operation text, _project uuid, _budget uuid, _expected uuid,
  _payload jsonb, _capture jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  org uuid; b public.external_budget%ROWTYPE; old public.external_budget_versions%ROWTYPE;
  src public.scenario_assumptions%ROWTYPE; next_id uuid := gen_random_uuid();
  budget_id uuid; next_number integer; body jsonb; archived timestamptz;
  source_scenario uuid; source_id uuid; source_number integer; source_calc text; source_json jsonb;
  duplicate_budget uuid; duplicate_version uuid; saved public.external_budget_versions%ROWTYPE;
BEGIN
  IF _actor IS NULL OR _operation IS NULL OR _operation NOT IN ('create','save','refresh','duplicate','archive','restore') THEN
    RAISE EXCEPTION 'Invalid external budget command' USING ERRCODE = '22023';
  END IF;
  SELECT p.organization_id INTO org FROM public.projects p
    WHERE p.id = _project AND p.deleted_at IS NULL FOR SHARE;
  IF org IS NULL OR NOT public.can_edit_org(org, _actor) THEN
    RAISE EXCEPTION 'Not authorized to edit external budgets' USING ERRCODE = '42501';
  END IF;
  -- Serialize this actor's membership against concurrent role removal/demotion.
  PERFORM 1 FROM public.organization_members m WHERE m.organization_id = org AND m.user_id = _actor
    AND m.role IN ('admin','editor') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  IF _operation = 'create' THEN
    IF _budget IS NOT NULL OR _expected IS NOT NULL THEN RAISE EXCEPTION 'Invalid create identity'; END IF;
    budget_id := gen_random_uuid(); next_number := 1; body := _payload;
  ELSE
    SELECT * INTO b FROM public.external_budget WHERE id = _budget AND project_id = _project AND organization_id = org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Budget not found or not authorized' USING ERRCODE = '42501'; END IF;
    IF _expected IS NULL OR _expected <> b.current_version_id THEN
      RAISE EXCEPTION 'External budget version conflict' USING ERRCODE = '40001';
    END IF;
    SELECT * INTO STRICT old FROM public.external_budget_versions WHERE id = b.current_version_id;
    IF b.archived_at IS NOT NULL AND _operation NOT IN ('restore','duplicate') THEN RAISE EXCEPTION 'Budget is archived'; END IF;
    IF _operation = 'restore' AND b.archived_at IS NULL THEN RAISE EXCEPTION 'Budget is not archived'; END IF;
    budget_id := b.id; next_number := old.version + 1; archived := b.archived_at;
    source_scenario := old.source_scenario_id; source_id := old.source_assumption_id;
    source_number := old.source_assumption_version; source_calc := old.source_calculation_version; source_json := old.source_assumptions;
    duplicate_budget := old.duplicated_from_budget_id; duplicate_version := old.duplicated_from_version_id;
    IF _operation = 'duplicate' THEN
      budget_id := gen_random_uuid(); next_number := 1; archived := NULL;
      body := jsonb_build_object('name', _payload->>'name', 'description', old.description,
        'sourceInfo', old.source_info, 'input', old.input);
      duplicate_budget := b.id; duplicate_version := old.id;
    ELSIF _operation IN ('archive','restore') THEN
      body := jsonb_build_object('name', old.name, 'description', old.description, 'sourceInfo', old.source_info, 'input', old.input);
      archived := CASE WHEN _operation = 'archive' THEN now() ELSE NULL END;
    ELSE
      body := _payload;
      IF _operation = 'save' AND (body->'input'->'inheritance') IS DISTINCT FROM (old.input->'inheritance') THEN
        RAISE EXCEPTION 'Inheritance can change only through explicit refresh' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  IF _operation IN ('create','refresh') AND _capture IS NOT NULL THEN
    SELECT a.* INTO src FROM public.scenario_assumptions a JOIN public.scenarios s ON s.id = a.scenario_id
      WHERE a.id = (_capture->>'id')::uuid AND a.scenario_id = (_capture->>'scenarioId')::uuid
      AND a.organization_id = org AND s.organization_id = org AND s.project_id = _project
      FOR SHARE OF a, s;
    IF NOT FOUND OR src.assumptions IS DISTINCT FROM _capture->'assumptions'
      OR src.version IS DISTINCT FROM (_capture->>'version')::integer
      OR src.calculation_version IS DISTINCT FROM _capture->>'calculationVersion' THEN
      RAISE EXCEPTION 'Source scenario/version changed or is not in the authorized project' USING ERRCODE = '23514';
    END IF;
    IF _operation = 'refresh' AND source_scenario IS NOT NULL AND source_scenario <> src.scenario_id THEN
      RAISE EXCEPTION 'Refresh must use the linked scenario' USING ERRCODE = '23514';
    END IF;
    source_scenario := src.scenario_id; source_id := src.id; source_number := src.version;
    source_calc := src.calculation_version; source_json := src.assumptions;
    IF jsonb_typeof(body->'input'->'inheritance') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Missing captured inheritance'; END IF;
  ELSIF _capture IS NOT NULL OR _operation = 'refresh' THEN
    RAISE EXCEPTION 'Capture is only allowed on create or refresh';
  END IF;
  IF _operation = 'create' AND _capture IS NULL AND body->'input' ? 'inheritance' THEN RAISE EXCEPTION 'Unverified inheritance'; END IF;
  IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR jsonb_typeof(body->'input') IS DISTINCT FROM 'object'
    OR body->'input'->>'version' IS DISTINCT FROM 'financial-input-v1'
    OR body->'input'->>'mode' IS DISTINCT FROM 'externalBudget'
    OR body->'input'->>'status' IS NULL OR body->'input'->>'status' NOT IN ('draft','complete') THEN
    RAISE EXCEPTION 'Invalid financial contract';
  END IF;
  IF body->'input'->>'status' = 'complete' AND source_id IS NULL THEN RAISE EXCEPTION 'Completion requires pinned inheritance'; END IF;
  IF _operation IN ('create','duplicate') THEN
    INSERT INTO public.external_budget(id, organization_id, project_id, current_version_id, created_by, updated_by)
      VALUES (budget_id, org, _project, next_id, _actor, _actor);
  END IF;
  INSERT INTO public.external_budget_versions(id, budget_id, organization_id, project_id, version, action,
    name, description, source_info, input, schema_version, financial_contract_version,
    source_scenario_id, source_assumption_id, source_assumption_version, source_calculation_version, source_assumptions,
    duplicated_from_budget_id, duplicated_from_version_id, created_by)
  VALUES (next_id, budget_id, org, _project, next_number, _operation,
    body->>'name', body->>'description', body->'sourceInfo', body->'input', 'external-budget-document-v1', 'financial-input-v1',
    source_scenario, source_id, source_number, source_calc, source_json, duplicate_budget, duplicate_version, _actor)
  RETURNING * INTO saved;
  UPDATE public.external_budget SET current_version_id = next_id, archived_at = archived, updated_at = now(), updated_by = _actor
    WHERE id = budget_id;
  RETURN jsonb_build_object('budget', (SELECT to_jsonb(h) FROM public.external_budget h WHERE h.id = budget_id), 'version', to_jsonb(saved));
END $$;
REVOKE ALL ON FUNCTION public.write_external_budget(uuid,text,uuid,uuid,uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.write_external_budget(uuid,text,uuid,uuid,uuid,jsonb,jsonb) TO service_role;
COMMENT ON FUNCTION public.write_external_budget(uuid,text,uuid,uuid,uuid,jsonb,jsonb)
IS 'Server-only atomic append/CAS. Caller must authenticate actor and validate/capture inputs with financial-input-v1; not executable by browser roles.';
