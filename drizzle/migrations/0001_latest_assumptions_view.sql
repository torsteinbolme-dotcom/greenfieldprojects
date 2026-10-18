CREATE VIEW public.latest_scenario_assumptions WITH (security_invoker = true) AS
SELECT DISTINCT ON (scenario_id) id, organization_id, scenario_id, version, assumptions, calculation_version, created_at
FROM public.scenario_assumptions ORDER BY scenario_id, version DESC;
GRANT SELECT ON public.latest_scenario_assumptions TO authenticated;