# Phase 1 — GitHub sync, migration execution and safest release

Assessment date: 21 October 2026. Read-only investigation and release planning only; no merge, deployment, migration or historical-data changes authorized.

## Superseding update

The user has now supplied Lovable confirmation that GitHub synchronization does not execute Drizzle migrations and frontend publishing is separate. Backups are available (latest visible 21 October 2026, 04:58:08 UTC). Exact ledger comparison confirms 0000–0011 recorded applied and 0012 pending. The isolated full-schema apply/rollback rehearsal passes 17 checks; full tests pass 494/494. Earlier unknowns and questions below are retained as investigation history, not current blockers. Current blockers are deployed seed preflight and exact published-build compatibility confirmation; see [current assessment and deployment sequence](phase1-release-readiness.md). No production action is authorized.

## What was established before these confirmations

| Question | Evidence | Conclusion |
|---|---|---|
| Is this a Lovable Cloud backend? | The user performed inspection through Lovable Cloud SQL Editor. | Yes, user-confirmed. |
| Is the original F&B trigger deployed? | User-confirmed trigger/function on public.scenario_assumptions, status O. | Enabled for ordinary sessions. |
| Did the supplied history heuristic find affected scenarios? | 306 versions; 108 legacy; 1 pattern match; 0 candidate scenarios. | No candidates detected. No proof of universal historical integrity; no backfill justified. |
| Does Lovable sync GitHub code? | Vendor GitHub documentation. | The currently selected branch syncs automatically. Main is the default, not proof of this project's selected branch. |
| Is ordinary frontend publication separate? | Vendor publishing documentation. | Later frontend changes normally require publishing a new snapshot. External deployment hooks still require workspace confirmation. |
| Can backend changes affect the live database without frontend publishing? | Vendor database documentation. | Yes. Drafts use the project database; code branches/drafts are not assumed to be database sandboxes. |
| How are migrations represented here? | drizzle.config.ts, drizzle/migrations/meta/_journal.json. | Drizzle SQL files and journal, with LOVABLE_DB_MIGRATION_URL supplied by the managed environment. |
| Does application startup/build invoke a migration runner? | package.json, src and installed Lovable Vite configuration inspected. | No invocation found. No committed .github workflow files. This does not exclude a managed platform job or external hook. |
| Does this workspace execute SQL when GitHub imports a migration? | No observed setting, historical run log or workspace-specific vendor confirmation. | **Unverified — main merge must remain blocked.** |

Sources: [Lovable GitHub sync](https://docs.lovable.dev/integrations/github), [Lovable database and migrations](https://docs.lovable.dev/features/database), [Lovable publishing](https://docs.lovable.dev/features/publish), [Lovable Cloud permissions](https://docs.lovable.dev/features/cloud), [Drizzle migrate](https://orm.drizzle.team/docs/drizzle-kit-migrate).

The documentation says Cloud's Modify database tool can perform SQL migrations, and many Cloud tools default to Always allow. Do not assume those defaults describe the current workspace. Likewise, Ask each time for backward-incompatible migrations is not proof that every GitHub-imported migration, DROP TRIGGER or managed job is approval-gated. The documentation reviewed does not explicitly guarantee how external GitHub SQL is handled by this workspace.

## Read-only evidence needed from the owner

Do not switch branches, accept a draft, approve a pending SQL operation or publish to investigate this.

1. In Project settings → Git → GitHub, record the connected repository, active synced branch and displayed commit/sync status.
2. Read the effective Cloud permission settings for Modify database, backward-incompatible migrations and Change data, including workspace inheritance. Record publishing approval settings separately. Do not change any settings as part of this inspection.
3. Read existing sync/build/backend logs for a previous externally pushed SQL migration. Establish whether sync only imported code, queued approval, or invoked a runner; identify the target database. An absence of visible events is not a guarantee of no automation.
4. Check configured external hosting/deployment connections and hooks. No workflow YAML in the repository does not establish their absence.
5. If historical logs do not answer the SQL-on-sync question, obtain workspace-specific confirmation from Lovable support: "When this GitHub-connected Cloud project's selected branch receives a commit adding a Drizzle SQL file and journal entry, which event executes that migration, what approval gate applies, which database is targeted, and can application sync be separated from database execution?" This is a question for owner/support review; no message has been sent.

Direct Chrome inspection was attempted but computer-use access was not approved. No Lovable settings have been observed by Codex. Owner-reported settings/log summaries can establish the missing evidence without sharing credentials or user assumptions.

## Migration-ledger cross-check (instructions only)

An authorized operator may inspect the existing migration ledger using a read-only transaction. First check the table exists:

```sql
BEGIN TRANSACTION READ ONLY;
SELECT to_regclass('drizzle.__drizzle_migrations') AS migration_ledger;
ROLLBACK;
```

Only if present and access is authorized:

```sql
BEGIN TRANSACTION READ ONLY;
SELECT id, hash, created_at
FROM drizzle.__drizzle_migrations
ORDER BY created_at, id;
ROLLBACK;
```

Compare hashes with phase1-migration-fingerprints.json, derived locally from the reviewed SQL bytes. Confirm the current seed function body against the expected MD5 9bc90882dbbe580fe2f2a21b9bc46ba1. The proposed migration checks that body and refuses an unexpected version. Do not overwrite a mismatch.

Important: in the installed Drizzle ORM runner, ledger created_at is populated from the journal's migration timestamp (folderMillis), not the actual execution clock. It cannot establish when or why SQL ran. A matching hash establishes ledger correspondence, not that GitHub sync caused execution. Use independent platform logs/vendor confirmation for execution timing and trigger mechanism. A missing ledger or divergent hashes require investigation; do not run migration repair, push, reset, generate or schema synchronization to "fix" the inspection result.

## Safest future release sequence — not executed

1. Keep PR #1 in draft and preserve historical assumptions. No candidate backfill is included.
2. Establish the sync/SQL/deployment boundaries above before merging any migration-bearing commit into the synced production branch. Do not test this with a dummy migration on the production project.
3. Rehearse the exact release on an explicitly separate staging backend, including signup defaults, legacy and explicit-growth saves, reload equality, financial references and the rollback procedure. Confirm it is not sharing production storage/auth/database.
4. Capture deployed definitions and ledger state; verify 0012 is the only intended pending migration. Obtain a reviewed backup/recovery plan and separately authorized, time-limited control of writes for release verification.
5. If independent migration approval is verified, review/approve the exact transaction through the established runner. Verify trigger removal, seed defaults, ledger entry and save/reload equality before publishing the application. Existing published code is expected to retain its previous scenario economics, but staging must verify this.
6. Merge/sync and publish only at separately approved points in the verified workflow. Code sync, SQL execution and frontend publication are three distinct release gates, even if the platform combines some operations.
7. If SQL-on-sync cannot be independently gated, do not merge this PR as-is. Propose separating the application-only change from the SQL/journal change for separate review and a controlled database release. Do not merely rename the SQL or assume leaving the app unpublished blocks execution. No such split has been implemented or approved.
8. After a separately authorized release, inspect financial references and save/reload behaviour using disposable staging/test records under an agreed plan. Rollback requires separate approval; the prepared database rollback restores the original transformation defect and must not be run automatically.

## Decision

**NO-GO for main merge/release:** the code compatibility work is verified and aggregate history inspection is complete, but SQL-on-sync behaviour, current effective permissions, seed/ledger checks and isolated release rehearsal remain open. The historical inspection results reduce concern; they do not authorize rewriting data or remove the prospective save-time defect.
