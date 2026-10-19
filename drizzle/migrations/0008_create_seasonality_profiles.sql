CREATE TABLE public.seasonality_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  benchmark_name TEXT NOT NULL,
  profile_name TEXT NOT NULL,
  month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
  allocation_pct NUMERIC NOT NULL CHECK (allocation_pct >= 0 AND allocation_pct <= 100),
  historical_passengers INTEGER,
  method TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, benchmark_name, profile_name, month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seasonality_profiles TO authenticated;
GRANT ALL ON public.seasonality_profiles TO service_role;
ALTER TABLE public.seasonality_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read" ON public.seasonality_profiles FOR SELECT TO authenticated USING (is_org_member(organization_id, auth.uid()));
CREATE POLICY "ins" ON public.seasonality_profiles FOR INSERT TO authenticated WITH CHECK (can_edit_org(organization_id, auth.uid()));
CREATE POLICY "upd" ON public.seasonality_profiles FOR UPDATE TO authenticated USING (can_edit_org(organization_id, auth.uid())) WITH CHECK (can_edit_org(organization_id, auth.uid()));
CREATE POLICY "del" ON public.seasonality_profiles FOR DELETE TO authenticated USING (can_edit_org(organization_id, auth.uid()));