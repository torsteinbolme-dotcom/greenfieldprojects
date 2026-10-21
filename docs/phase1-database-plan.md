# Phase 1 database migration and rollback plan

Status: review only. No production query, migration or data update has been executed.

## Investigation before calculation changes

Migration `0007_default_independent_fb_opex_growth` is tracked in the repository migration journal. Its BEFORE INSERT trigger injects a nonempty `opexGrowth.fb` list into any new assumptions version with a missing or empty list. The engine interprets a nonempty list differently from legacy revenue/passenger-linked costs. Source presence is not evidence of production deployment.

Only public/publishable application configuration is available locally; no database connection string, service credential or connected database administration tool is available. Deployment status and affected live scenario counts are therefore UNKNOWN. Do not infer them from repository fixtures. An authorized database administrator can run `scripts/phase1-fb-opex-inspection.sql` in a read-only transaction. It returns trigger state and aggregate candidate counts, not user assumptions. Candidates require review; matching values do not prove that a trigger rather than a user supplied them.

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

Production deployment remains out of scope. Local tests cannot establish deployed RLS/trigger state. The PR must retain this limitation until an authorized operator supplies the read-only inspection results.
