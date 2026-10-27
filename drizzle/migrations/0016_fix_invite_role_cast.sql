DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.handle_new_user'::regproc);
  IF position('inv.role)' in d) = 0 THEN RAISE EXCEPTION 'expected text not found'; END IF;
  EXECUTE replace(d, 'inv.role)', 'inv.role::public.org_role)');
END $$;