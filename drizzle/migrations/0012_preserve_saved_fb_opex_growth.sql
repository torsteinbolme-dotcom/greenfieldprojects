-- Prospective only. Preserve reviewed onboarding and sample assumptions.
-- Both reviewed original bodies are accepted; any other body fails closed.
DO $phase1$
DECLARE seed record; definition text; updated_body text;
BEGIN
  SELECT p.oid, p.prosrc, p.prosecdef, p.prorettype, l.lanname INTO seed
  FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
  WHERE p.oid=to_regprocedure('public.handle_new_user()');
  IF NOT FOUND OR md5(seed.prosrc) NOT IN
    ('9bc90882dbbe580fe2f2a21b9bc46ba1', 'dba5cac31a644e281737569429904ec6') THEN
    RAISE EXCEPTION 'Phase 1: unrecognized new-user seed function; inspect before migrating';
  END IF;
  IF seed.lanname <> 'plpgsql' OR seed.prorettype <> 'trigger'::regtype OR NOT seed.prosecdef THEN
    RAISE EXCEPTION 'Phase 1: unexpected seed function attributes';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='auth.users'::regclass
    AND tgname='on_auth_user_created' AND tgfoid=seed.oid AND tgtype=5
    AND tgenabled IN ('O','A') AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Phase 1: expected enabled auth signup trigger missing';
  END IF;
  IF md5(seed.prosrc)='dba5cac31a644e281737569429904ec6'
     AND (to_regclass('public.organization_invites') IS NULL OR NOT EXISTS
       (SELECT 1 FROM pg_attribute WHERE attrelid='auth.users'::regclass
        AND attname='raw_user_meta_data' AND NOT attisdropped)) THEN
    RAISE EXCEPTION 'Phase 1: invitation onboarding dependencies missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.scenario_assumptions'::regclass
    AND tgname='default_fb_opex_growth' AND tgfoid=to_regprocedure('public.default_fb_opex_growth()')
    AND tgtype=7 AND tgenabled IN ('O','A') AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Phase 1: expected enabled F&B insert trigger missing';
  END IF;
  updated_body := replace(seed.prosrc, '"costInflation":0.025,"capexItems":', '"costInflation":0.025,"opexGrowth":{"fb":[0.025,0.025,0.025]},"capexItems":');
  IF md5(updated_body) NOT IN ('8bccc675f3dc982b131ebbb72d0055c1', '16f91e1d10c86c988cf9713e8fba778e') THEN
    RAISE EXCEPTION 'Phase 1: unexpected seed transformation';
  END IF;
  definition := pg_get_functiondef(seed.oid);
  -- Reuse the reviewed definition: preserve invitation path, sample horizon,
  -- function settings, owner/ACL and existing trigger references.
  EXECUTE replace(definition, seed.prosrc, updated_body);
  -- Retain the defaulting function for rollback. Never update saved JSON.
  DROP TRIGGER IF EXISTS default_fb_opex_growth ON public.scenario_assumptions;
END $phase1$;
