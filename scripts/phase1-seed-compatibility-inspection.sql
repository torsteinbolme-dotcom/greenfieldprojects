-- Authorized administrator review only. Read-only catalog inspection; no user records.
BEGIN TRANSACTION READ ONLY;
SELECT p.oid::regprocedure AS signature, md5(p.prosrc) AS seed_body_hash,
       pg_get_functiondef(p.oid) AS seed_definition,
       pg_get_userbyid(p.proowner) AS owner, p.prosecdef AS security_definer,
       p.proconfig AS function_settings, p.proacl AS grants,
       l.lanname AS language
FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
WHERE p.oid=to_regprocedure('public.handle_new_user()');

SELECT t.tgname, t.tgenabled, t.tgrelid::regclass AS relation,
       t.tgfoid::regprocedure AS function, pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t
WHERE NOT t.tgisinternal AND
  (t.tgfoid=to_regprocedure('public.handle_new_user()') OR
   t.tgfoid=to_regprocedure('public.default_fb_opex_growth()'));

SELECT pg_describe_object(d.classid,d.objid,d.objsubid) AS dependent,
       d.deptype,
       pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid) AS referenced
FROM pg_depend d
WHERE (d.refclassid='pg_proc'::regclass AND d.refobjid IN
       (to_regprocedure('public.handle_new_user()'),to_regprocedure('public.default_fb_opex_growth()')))
   OR (d.classid='pg_proc'::regclass AND d.objid IN
       (to_regprocedure('public.handle_new_user()'),to_regprocedure('public.default_fb_opex_growth()')))
ORDER BY dependent,referenced;
-- PL/pgSQL string bodies do not catalogue every runtime table/function reference;
-- review seed_definition and the auth trigger, not pg_depend alone.
ROLLBACK;
