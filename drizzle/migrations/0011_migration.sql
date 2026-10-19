ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS deleted_at timestamptz, ADD COLUMN IF NOT EXISTS deleted_by uuid;

DROP POLICY IF EXISTS "read" ON public.projects;
CREATE POLICY "read" ON public.projects FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) AND deleted_at IS NULL);

DROP POLICY IF EXISTS "read" ON public.scenarios;
CREATE POLICY "read" ON public.scenarios FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid())
    AND NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = scenarios.project_id AND p.deleted_at IS NOT NULL));

CREATE OR REPLACE FUNCTION public.soft_delete_project(_project uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _org uuid;
BEGIN
  SELECT organization_id INTO _org FROM projects WHERE id = _project AND deleted_at IS NULL;
  IF _org IS NULL OR auth.uid() IS NULL OR NOT can_edit_org(_org, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to delete this project';
  END IF;
  UPDATE projects SET deleted_at = now(), deleted_by = auth.uid() WHERE id = _project;
END $$;
REVOKE ALL ON FUNCTION public.soft_delete_project(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_project(uuid) TO authenticated;