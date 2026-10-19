CREATE OR REPLACE FUNCTION public.guard_tenant_relationships()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Organization identity cannot be changed' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'scenarios' THEN
    IF TG_OP = 'UPDATE' AND (NEW.project_id IS DISTINCT FROM OLD.project_id OR ((OLD.kind = 'base' OR NEW.kind = 'base') AND NEW.kind IS DISTINCT FROM OLD.kind)) THEN
      RAISE EXCEPTION 'Scenario project and Base identity cannot be changed' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = NEW.project_id AND p.organization_id = NEW.organization_id) THEN
      RAISE EXCEPTION 'Scenario project must belong to the same organization' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'benchmark_assets' THEN
    IF NEW.parent_asset_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.benchmark_assets a WHERE a.id = NEW.parent_asset_id AND a.organization_id = NEW.organization_id) THEN
      RAISE EXCEPTION 'Benchmark parent must belong to the same organization' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'benchmark_records' THEN
    IF NOT EXISTS (SELECT 1 FROM public.benchmark_assets a WHERE a.id = NEW.asset_id AND a.organization_id = NEW.organization_id) THEN
      RAISE EXCEPTION 'Benchmark asset must belong to the same organization' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_tenant_relationships() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_tenant_relationships() TO authenticated, service_role;
CREATE TRIGGER guard_project_organization BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_relationships();
CREATE TRIGGER guard_scenario_relationships BEFORE INSERT OR UPDATE ON public.scenarios FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_relationships();
CREATE TRIGGER guard_benchmark_asset_relationships BEFORE INSERT OR UPDATE ON public.benchmark_assets FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_relationships();
CREATE TRIGGER guard_benchmark_record_relationships BEFORE INSERT OR UPDATE ON public.benchmark_records FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_relationships();