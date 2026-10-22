-- REVIEW ONLY; separate approval required. Restores the known save-time defect.
-- Pause writes; verify deployed catalog and runner ledger before rollback.
BEGIN;
DO $phase1_rollback$
DECLARE seed record; original_body text;
BEGIN
  SELECT oid, prosrc INTO seed FROM pg_proc
  WHERE oid=to_regprocedure('public.handle_new_user()');
  IF NOT FOUND OR md5(seed.prosrc) NOT IN
    ('8bccc675f3dc982b131ebbb72d0055c1', '16f91e1d10c86c988cf9713e8fba778e') THEN
    RAISE EXCEPTION 'Phase 1 rollback: unrecognized migrated seed function';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.scenario_assumptions'::regclass
    AND tgname='default_fb_opex_growth') THEN
    RAISE EXCEPTION 'Phase 1 rollback: default trigger already exists; inspect state';
  END IF;
  IF to_regprocedure('public.default_fb_opex_growth()') IS NULL THEN
    RAISE EXCEPTION 'Phase 1 rollback: retained defaulting function missing';
  END IF;
  original_body := replace(seed.prosrc, '"costInflation":0.025,"opexGrowth":{"fb":[0.025,0.025,0.025]},"capexItems":', '"costInflation":0.025,"capexItems":');
  IF md5(original_body) NOT IN
    ('9bc90882dbbe580fe2f2a21b9bc46ba1', 'dba5cac31a644e281737569429904ec6') THEN
    RAISE EXCEPTION 'Phase 1 rollback: unexpected seed transformation';
  END IF;
  EXECUTE replace(pg_get_functiondef(seed.oid), seed.prosrc, original_body);
  CREATE TRIGGER default_fb_opex_growth BEFORE INSERT ON public.scenario_assumptions
    FOR EACH ROW EXECUTE FUNCTION public.default_fb_opex_growth();
END $phase1_rollback$;
COMMIT;
