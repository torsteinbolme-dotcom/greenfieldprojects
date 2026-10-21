-- Fail closed if the deployed seed function differs from the reviewed repository version.
DO $phase1$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.handle_new_user()'::regprocedure)
     IS DISTINCT FROM '9bc90882dbbe580fe2f2a21b9bc46ba1' THEN
    RAISE EXCEPTION 'Phase 1: unrecognized new-user seed function; inspect before migrating';
  END IF;
END $phase1$;

-- Prospective only: preserve every existing assumptions version and its financial behaviour.
-- Creation defaults remain in application template helpers, not arbitrary version inserts.
-- Retain the function for the separately reviewed rollback; do not backfill any JSON.
DROP TRIGGER IF EXISTS default_fb_opex_growth ON public.scenario_assumptions;

-- Preserve the existing new-user template defaults explicitly at creation.
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
  '{"name":"Project Mountain","openingYear":2030,"years":30,"initialPassengers":225000,"segments":[{"name":"Roundtrip adult","share":0.39,"grossPrice":699,"vatRate":0.12,"commission":0,"boardingsPerGuest":2},{"name":"Roundtrip child","share":0.07,"grossPrice":349.5,"vatRate":0.12,"commission":0,"boardingsPerGuest":2},{"name":"One-way adult","share":0.15,"grossPrice":489.3,"vatRate":0.12,"commission":0,"boardingsPerGuest":1},{"name":"One-way child","share":0.03,"grossPrice":244.65,"vatRate":0.12,"commission":0,"boardingsPerGuest":1},{"name":"Annual pass adult","share":0.01,"grossPrice":3495,"vatRate":0.12,"commission":0,"boardingsPerGuest":8},{"name":"Cruise","share":0.25,"grossPrice":699,"vatRate":0.12,"commission":0.2,"boardingsPerGuest":2},{"name":"Tour operators","share":0.1,"grossPrice":699,"vatRate":0.12,"commission":0.15,"boardingsPerGuest":2}],"passengerGrowth":[0.2,0.15,0.04],"priceGrowth":[0.05,0.05,0.03],"fbRevenueYear1":26368000,"merchRevenueYear1":5000000,"ancillaryGrowth":[0.2,0.15,0.04],"cableFixedOpex":28224587,"cableVariableCostPerPassenger":0,"fbOpexYear1":24515000,"merchOpexYear1":3000000,"costInflation":0.025,"opexGrowth":{"fb":[0.025,0.025,0.025]},"capexItems":[{"name":"Top station (m²)","quantity":3500,"unitCost":175000},{"name":"Lower station (m²)","quantity":1000,"unitCost":80000},{"name":"Skywalk","quantity":1,"unitCost":40000000},{"name":"Architect","quantity":1,"unitCost":10000000},{"name":"Cable car","quantity":1,"unitCost":250000000},{"name":"Zoning process","quantity":1,"unitCost":10000000},{"name":"Engineering design","quantity":1,"unitCost":60000000},{"name":"Outdoor areas","quantity":1,"unitCost":20000000},{"name":"Tunnel","quantity":1,"unitCost":300000000}],"contingencyRate":0.2,"debtShare":0.6,"interestRate":0.06,"loanYears":15,"taxRate":0.22,"depreciationYears":25,"maintenanceCapexRate":0.01,"exitYear":8,"exitMultiple":15,"exitTransactionCostRate":0.01,"distributeCashAnnually":false}'::jsonb,
  'Seeded from Project Mountain example', NEW.id);
  RETURN NEW;
END $$;
