CREATE OR REPLACE FUNCTION public.import_seasonality_profiles(p_organization_id uuid, p_rows jsonb, p_replace boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_edit_org(p_organization_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to edit this organization';
  END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'No seasonality rows supplied';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_rows) AS r(benchmark text, profile text, month numeric, allocation_pct numeric, historical_passengers numeric)
    WHERE benchmark IS NULL OR btrim(benchmark) = '' OR profile IS NULL OR btrim(profile) = ''
      OR month IS NULL OR month NOT BETWEEN 1 AND 12 OR month <> trunc(month)
      OR allocation_pct IS NULL OR allocation_pct NOT BETWEEN 0 AND 100
      OR (historical_passengers IS NOT NULL AND (historical_passengers NOT BETWEEN 0 AND 2147483647 OR historical_passengers <> trunc(historical_passengers)))
  ) THEN RAISE EXCEPTION 'Invalid seasonality month, percentage or historical passenger count'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_rows) AS r(benchmark text, profile text, month numeric, allocation_pct numeric, historical_passengers numeric)
    GROUP BY benchmark, profile
    HAVING count(*) <> 12 OR count(DISTINCT month) <> 12 OR abs(sum(allocation_pct) - 100) > 0.06000001
      OR (count(historical_passengers) NOT IN (0, 12))
      OR (count(historical_passengers) = 12 AND sum(historical_passengers) <= 0)
  ) THEN RAISE EXCEPTION 'Each profile requires 12 unique months, total 100 percent and complete historical passenger figures'; END IF;
  IF EXISTS (
    SELECT 1 FROM (
      SELECT allocation_pct, historical_passengers, sum(historical_passengers) OVER (PARTITION BY benchmark, profile) AS annual_total
      FROM jsonb_to_recordset(p_rows) AS r(benchmark text, profile text, month numeric, allocation_pct numeric, historical_passengers numeric)
    ) shares WHERE historical_passengers IS NOT NULL
      AND abs(allocation_pct - historical_passengers * 100 / annual_total) > 0.00500001
  ) THEN RAISE EXCEPTION 'Historical passengers and monthly percentages do not reconcile'; END IF;
  IF NOT coalesce(p_replace, false) AND EXISTS (
    SELECT 1 FROM public.seasonality_profiles s
    JOIN jsonb_to_recordset(p_rows) AS r(benchmark text, profile text) ON s.benchmark_name = r.benchmark AND s.profile_name = r.profile
    WHERE s.organization_id = p_organization_id
  ) THEN RAISE EXCEPTION 'Profile already exists; confirm replacement'; END IF;
  INSERT INTO public.seasonality_profiles (organization_id, benchmark_name, profile_name, month, allocation_pct, historical_passengers, method)
  SELECT p_organization_id, benchmark, profile, month::smallint, allocation_pct, historical_passengers::integer, method
  FROM jsonb_to_recordset(p_rows) AS r(benchmark text, profile text, month numeric, allocation_pct numeric, historical_passengers numeric, method text)
  ON CONFLICT (organization_id, benchmark_name, profile_name, month) DO UPDATE SET
    allocation_pct = EXCLUDED.allocation_pct, historical_passengers = EXCLUDED.historical_passengers, method = EXCLUDED.method;
END;
$$;
REVOKE ALL ON FUNCTION public.import_seasonality_profiles(uuid, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_seasonality_profiles(uuid, jsonb, boolean) TO authenticated;
COMMENT ON FUNCTION public.import_seasonality_profiles(uuid, jsonb, boolean) IS 'Validated, org-scoped atomic seasonality import/replacement. Uses caller RLS; never deletes saved profiles.';