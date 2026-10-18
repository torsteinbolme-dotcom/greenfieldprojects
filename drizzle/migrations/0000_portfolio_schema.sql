CREATE TYPE public.org_role AS ENUM ('admin','editor','viewer');

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.organization_members (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  email text,
  role public.org_role NOT NULL DEFAULT 'viewer',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_org_member(_org uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id=_org AND user_id=_user)
$$;
CREATE OR REPLACE FUNCTION public.can_edit_org(_org uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id=_org AND user_id=_user AND role IN ('admin','editor'))
$$;
CREATE OR REPLACE FUNCTION public.is_org_admin(_org uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id=_org AND user_id=_user AND role='admin')
$$;

CREATE POLICY "members read org" ON public.organizations FOR SELECT TO authenticated USING (public.is_org_member(id, auth.uid()));
CREATE POLICY "admins update org" ON public.organizations FOR UPDATE TO authenticated USING (public.is_org_admin(id, auth.uid())) WITH CHECK (public.is_org_admin(id, auth.uid()));

CREATE POLICY "members read members" ON public.organization_members FOR SELECT TO authenticated USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "admins update members" ON public.organization_members FOR UPDATE TO authenticated USING (public.is_org_admin(organization_id, auth.uid()) AND user_id <> auth.uid()) WITH CHECK (public.is_org_admin(organization_id, auth.uid()));
CREATE POLICY "admins delete members" ON public.organization_members FOR DELETE TO authenticated USING (public.is_org_admin(organization_id, auth.uid()) AND user_id <> auth.uid());

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  location text,
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  assumption_notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'custom' CHECK (kind IN ('base','conservative','optimistic','custom')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_base_per_project ON public.scenarios(project_id) WHERE kind='base';
CREATE TABLE public.scenario_assumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scenario_id uuid NOT NULL REFERENCES public.scenarios(id) ON DELETE CASCADE,
  version integer NOT NULL,
  assumptions jsonb NOT NULL,
  calculation_version text NOT NULL DEFAULT 'mountain-v1',
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scenario_id, version)
);
CREATE TABLE public.project_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  size_bytes bigint,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id uuid,
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects, public.scenarios, public.scenario_assumptions, public.project_files TO authenticated;
GRANT SELECT, INSERT ON public.audit_events TO authenticated;
GRANT ALL ON public.projects, public.scenarios, public.scenario_assumptions, public.project_files, public.audit_events TO service_role;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenario_assumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read" ON public.projects FOR SELECT TO authenticated USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "insert" ON public.projects FOR INSERT TO authenticated WITH CHECK (public.can_edit_org(organization_id, auth.uid()));
CREATE POLICY "update" ON public.projects FOR UPDATE TO authenticated USING (public.can_edit_org(organization_id, auth.uid())) WITH CHECK (public.can_edit_org(organization_id, auth.uid()));
CREATE POLICY "delete" ON public.projects FOR DELETE TO authenticated USING (public.can_edit_org(organization_id, auth.uid()));

CREATE POLICY "read" ON public.scenarios FOR SELECT TO authenticated USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "insert" ON public.scenarios FOR INSERT TO authenticated WITH CHECK (public.can_edit_org(organization_id, auth.uid()) AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id=project_id AND p.organization_id=scenarios.organization_id));
CREATE POLICY "update" ON public.scenarios FOR UPDATE TO authenticated USING (public.can_edit_org(organization_id, auth.uid())) WITH CHECK (public.can_edit_org(organization_id, auth.uid()));
CREATE POLICY "delete" ON public.scenarios FOR DELETE TO authenticated USING (public.can_edit_org(organization_id, auth.uid()) AND kind <> 'base');

CREATE POLICY "read" ON public.scenario_assumptions FOR SELECT TO authenticated USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "insert" ON public.scenario_assumptions FOR INSERT TO authenticated WITH CHECK (public.can_edit_org(organization_id, auth.uid()) AND EXISTS (SELECT 1 FROM public.scenarios s WHERE s.id=scenario_id AND s.organization_id=scenario_assumptions.organization_id));

CREATE POLICY "read" ON public.project_files FOR SELECT TO authenticated USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "insert" ON public.project_files FOR INSERT TO authenticated WITH CHECK (public.can_edit_org(organization_id, auth.uid()) AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id=project_id AND p.organization_id=project_files.organization_id));
CREATE POLICY "delete" ON public.project_files FOR DELETE TO authenticated USING (public.can_edit_org(organization_id, auth.uid()));

CREATE POLICY "read" ON public.audit_events FOR SELECT TO authenticated USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "insert" ON public.audit_events FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id, auth.uid()) AND actor_id = auth.uid());

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _org uuid; _proj uuid; _scen uuid;
BEGIN
  INSERT INTO public.organizations(name) VALUES (coalesce(split_part(NEW.email,'@',1),'My') || '''s organization') RETURNING id INTO _org;
  INSERT INTO public.organization_members(organization_id,user_id,email,role) VALUES (_org, NEW.id, NEW.email, 'admin');
  INSERT INTO public.projects(organization_id,name,location,description,assumption_notes,created_by)
  VALUES (_org,'Project Mountain','Norway','Seed example based on visible Project Mountain workbook inputs.',
   'Illustrative assumptions not taken from the original workbook: cable variable cost per passenger (0), debt share, interest rate, loan tenor, depreciation period, maintenance capex rate, exit transaction costs, and growth rates beyond year 4. Verify before use.', NEW.id)
  RETURNING id INTO _proj;
  INSERT INTO public.scenarios(organization_id,project_id,name,kind) VALUES (_org,_proj,'Base','base') RETURNING id INTO _scen;
  INSERT INTO public.scenario_assumptions(organization_id,scenario_id,version,assumptions,note,created_by) VALUES (_org,_scen,1,
  '{"name":"Project Mountain","openingYear":2030,"years":30,"initialPassengers":225000,"segments":[{"name":"Roundtrip adult","share":0.39,"grossPrice":699,"vatRate":0.12,"commission":0,"boardingsPerGuest":2},{"name":"Roundtrip child","share":0.07,"grossPrice":349.5,"vatRate":0.12,"commission":0,"boardingsPerGuest":2},{"name":"One-way adult","share":0.15,"grossPrice":489.3,"vatRate":0.12,"commission":0,"boardingsPerGuest":1},{"name":"One-way child","share":0.03,"grossPrice":244.65,"vatRate":0.12,"commission":0,"boardingsPerGuest":1},{"name":"Annual pass adult","share":0.01,"grossPrice":3495,"vatRate":0.12,"commission":0,"boardingsPerGuest":8},{"name":"Cruise","share":0.25,"grossPrice":699,"vatRate":0.12,"commission":0.2,"boardingsPerGuest":2},{"name":"Tour operators","share":0.1,"grossPrice":699,"vatRate":0.12,"commission":0.15,"boardingsPerGuest":2}],"passengerGrowth":[0.2,0.15,0.04],"priceGrowth":[0.05,0.05,0.03],"fbRevenueYear1":26368000,"merchRevenueYear1":5000000,"ancillaryGrowth":[0.2,0.15,0.04],"cableFixedOpex":28224587,"cableVariableCostPerPassenger":0,"fbOpexYear1":24515000,"merchOpexYear1":3000000,"costInflation":0.025,"capexItems":[{"name":"Top station (m²)","quantity":3500,"unitCost":175000},{"name":"Lower station (m²)","quantity":1000,"unitCost":80000},{"name":"Skywalk","quantity":1,"unitCost":40000000},{"name":"Architect","quantity":1,"unitCost":10000000},{"name":"Cable car","quantity":1,"unitCost":250000000},{"name":"Zoning process","quantity":1,"unitCost":10000000},{"name":"Engineering design","quantity":1,"unitCost":60000000},{"name":"Outdoor areas","quantity":1,"unitCost":20000000},{"name":"Tunnel","quantity":1,"unitCost":300000000}],"contingencyRate":0.2,"debtShare":0.6,"interestRate":0.06,"loanYears":15,"taxRate":0.22,"depreciationYears":25,"maintenanceCapexRate":0.01,"exitYear":8,"exitMultiple":15,"exitTransactionCostRate":0.01,"distributeCashAnnually":false}'::jsonb,
  'Seeded from Project Mountain example', NEW.id);
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE POLICY "org members read files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='project-files' AND public.is_org_member(((storage.foldername(name))[1])::uuid, auth.uid()));
CREATE POLICY "org editors upload files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='project-files' AND public.can_edit_org(((storage.foldername(name))[1])::uuid, auth.uid()));
CREATE POLICY "org editors delete files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='project-files' AND public.can_edit_org(((storage.foldername(name))[1])::uuid, auth.uid()));