-- Review/run only with authorized read access. Never writes production data.
BEGIN TRANSACTION READ ONLY;
SELECT t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS definition,
       pg_get_functiondef(t.tgfoid) AS function_definition
FROM pg_trigger t
WHERE t.tgrelid = 'public.scenario_assumptions'::regclass
  AND NOT t.tgisinternal
  AND t.tgname = 'default_fb_opex_growth';

SELECT pg_get_functiondef('public.handle_new_user()'::regprocedure) AS seed_definition,
       md5(prosrc) AS seed_body_hash
FROM pg_proc WHERE oid = 'public.handle_new_user()'::regprocedure;

-- Aggregate candidates only. Cannot prove who supplied a growth list, nor recover a draft.
WITH versions AS (
  SELECT scenario_id, version, assumptions,
         lag(assumptions) OVER (PARTITION BY scenario_id ORDER BY version) AS previous
  FROM public.scenario_assumptions
), candidates AS (
  SELECT *, CASE WHEN jsonb_typeof(assumptions #> '{opexGrowth,fb}') = 'array'
                 THEN jsonb_array_length(assumptions #> '{opexGrowth,fb}') > 0 ELSE false END AS explicit_growth,
    COALESCE(previous #> '{opexGrowth,fb}', '[]'::jsonb) IN ('[]'::jsonb, 'null'::jsonb) AS previous_missing,
    (assumptions #> '{opexGrowth,fb}') = jsonb_build_array(
       COALESCE(NULLIF(assumptions->'costInflation', 'null'::jsonb), '0.025'::jsonb),
       COALESCE(NULLIF(assumptions->'costInflation', 'null'::jsonb), '0.025'::jsonb),
       COALESCE(NULLIF(assumptions->'costInflation', 'null'::jsonb), '0.025'::jsonb)) AS resembles_trigger
  FROM versions
)
SELECT count(*) AS versions,
       count(*) FILTER (WHERE NOT explicit_growth) AS legacy_versions,
       count(*) FILTER (WHERE resembles_trigger) AS versions_matching_trigger_pattern,
       count(DISTINCT scenario_id) FILTER (WHERE previous IS NOT NULL AND previous_missing AND resembles_trigger) AS candidate_scenarios
FROM candidates;
ROLLBACK;
