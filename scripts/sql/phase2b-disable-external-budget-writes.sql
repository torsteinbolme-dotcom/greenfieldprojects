-- Recovery artifact, NOT a pending Drizzle migration. Separate operator approval required.
-- Disable all budget lifecycle writes. Keep tables, versions, provenance, RLS and reads.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.write_external_budget(uuid,text,uuid,uuid,uuid,jsonb,jsonb) FROM service_role;
COMMIT;
-- Re-enable only after a separate reviewed fix/preflight/approval:
-- GRANT EXECUTE ON FUNCTION public.write_external_budget(uuid,text,uuid,uuid,uuid,jsonb,jsonb) TO service_role;
