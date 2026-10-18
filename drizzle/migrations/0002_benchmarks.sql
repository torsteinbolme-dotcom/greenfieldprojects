CREATE TABLE public.benchmark_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  business_type text NOT NULL CHECK (business_type IN ('cable_car','fnb')),
  parent_asset_id uuid REFERENCES public.benchmark_assets(id) ON DELETE SET NULL,
  location text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.benchmark_assets TO authenticated;
GRANT ALL ON public.benchmark_assets TO service_role;
ALTER TABLE public.benchmark_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY read ON public.benchmark_assets FOR SELECT TO authenticated USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY ins ON public.benchmark_assets FOR INSERT TO authenticated WITH CHECK (public.can_edit_org(organization_id, auth.uid()));
CREATE POLICY upd ON public.benchmark_assets FOR UPDATE TO authenticated USING (public.can_edit_org(organization_id, auth.uid())) WITH CHECK (public.can_edit_org(organization_id, auth.uid()));
CREATE POLICY del ON public.benchmark_assets FOR DELETE TO authenticated USING (public.can_edit_org(organization_id, auth.uid()));

CREATE TABLE public.benchmark_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.benchmark_assets(id) ON DELETE CASCADE,
  financial_year integer NOT NULL,
  passengers numeric,
  revenue numeric,
  opex numeric,
  ebitda numeric,
  currency text NOT NULL DEFAULT 'NOK',
  source text,
  data_status text NOT NULL DEFAULT 'actual' CHECK (data_status IN ('actual','budget','estimate')),
  comparability_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, financial_year, data_status)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.benchmark_records TO authenticated;
GRANT ALL ON public.benchmark_records TO service_role;
ALTER TABLE public.benchmark_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY read ON public.benchmark_records FOR SELECT TO authenticated USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY ins ON public.benchmark_records FOR INSERT TO authenticated WITH CHECK (public.can_edit_org(organization_id, auth.uid()));
CREATE POLICY upd ON public.benchmark_records FOR UPDATE TO authenticated USING (public.can_edit_org(organization_id, auth.uid())) WITH CHECK (public.can_edit_org(organization_id, auth.uid()));
CREATE POLICY del ON public.benchmark_records FOR DELETE TO authenticated USING (public.can_edit_org(organization_id, auth.uid()));