# Phase 1 database migration and rollback plan

Status: review only. Codex has executed no production query, migration or data update. On 21 October 2026 the user reported a read-only Lovable Cloud inspection confirming the default_fb_opex_growth trigger/function is deployed and enabled (O) on public.scenario_assumptions. The authorized aggregate inspection subsequently reported 306 assumption versions, 108 legacy versions, 1 trigger-pattern match and 0 candidate scenarios. This is indicative, not conclusive proof of historical integrity. The user reports Lovable confirmed synchronization does not execute migrations and frontend publishing is separate; preserve all historical assumptions. See phase1-release-readiness.md.

## Investigation before calculation changes

Migration `0007_default_independent_fb_opex_growth` is tracked in the repository migration journal. Its BEFORE INSERT trigger injects a nonempty `opexGrowth.fb` list into any new assumptions version with a missing or empty list. The engine interprets a nonempty list differently from legacy revenue/passenger-linked costs. Source presence is not evidence of production deployment.

Only public/publishable application configuration is available locally; no database connection string, service credential or connected database administration tool is available. The user has now confirmed deployment through an authorized inspection. The user reported 0 candidate scenarios under the supplied heuristic (306 versions, 108 legacy, 1 pattern match). This does not prove there were no historical effects. The supplied ledger matches migrations 0000–0011 exactly; 0012 is pending. The supplied production body hashes to dba5cac31a644e281737569429904ec6 and adds invitation onboarding plus a 15-year sample. Revised 0012 and guarded rollback preserve that implementation. Do not infer them from repository fixtures. An authorized database administrator can run `scripts/phase1-fb-opex-inspection.sql` in a read-only transaction. It returns trigger state and aggregate candidate counts, not user assumptions. Candidates require review; matching values do not prove that a trigger rather than a user supplied them.

## Proposed migration

1. Capture the deployed trigger/function definitions and migration state using read-only catalog queries. The migration refuses to replace an unrecognized new-user seed function; review any deployment-specific changes first.
2. Verify save/reload behaviour against a disposable local database, with missing, empty and explicit F&B growth lists, including passenger-linked benchmark assumptions.
3. Review `0012_preserve_saved_fb_opex_growth.sql`. It drops the insert-time default trigger and makes the same three F&B defaults explicit in the new-user example creation function; it does not update/delete assumptions, projects or benchmark data. Keep the existing function for reversible rollback.
4. Apply only after separate deployment approval, in a transaction through the normal migration runner. New-project defaults remain in creation helpers and the database new-user example. Existing assumptions with explicit growth lists retain them; legacy missing/empty lists remain missing/empty.
5. Verify new-version input equality and financial output equality on disposable staging scenarios before release. Confirm the deployed catalog no longer contains the defaulting trigger.

No backfill is proposed. Previously injected lists cannot be distinguished reliably from user-entered lists by value alone. Any restoration of historical economics requires separate user approval and a new scenario version, never an overwrite.

## Rollback

Pause writes, revert the application release, then explicitly run `docs/sql/phase1-fb-opex-rollback.sql` in a transaction after approval. It restores the original new-user example creation function and recreates the original trigger against the retained defaulting function, without updating any saved row. Check the migration runner's history before a subsequent reapplication. Restoring the trigger also restores the known save-time transformation defect; keep writes paused until the issue is resolved. Do not automatically reverse the migration or modify production records.

## Release gate

Production deployment remains out of scope. Local tests cannot establish deployed RLS/trigger state. The aggregate inspection results are now recorded. The revised candidate passes 30 production-body and 26 repository-body PostgreSQL checks, including invitation onboarding and exact row preservation; all 494 tests pass. The PR remains in draft pending published-build compatibility confirmation, release preflight and explicit release approval. See phase1-seed-drift-investigation.md. See phase1-release-readiness.md for the current evidence and controlled sequence.
