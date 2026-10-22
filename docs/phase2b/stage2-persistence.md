# Phase 2B Stage 2 External Budget Persistence and Versioning

Stage 2 adds dedicated budget storage, immutable version history and authenticated lifecycle operations. It starts from main `a93e1065e6fd5bcb0a3e75cb96a2461c9b95ef4d`. Financial Engine v1.0 and the approved Stage 1 input contract remain unchanged. The feature is prepared for draft review; production migration and publication require separate approvals.

## Tables and identity

| Table | Responsibility |
| --- | --- |
| `public.external_budget` | Stable budget UUID, immutable organization/project ownership and creation metadata, current-version UUID, archival timestamp and last author/timestamp. |
| `public.external_budget_versions` | Immutable version UUID and sequential number; action; name/description/source information; full draft or complete input; schema and financial-contract versions; original source identity and assumptions; author/timestamp; optional duplication provenance. |

Names belong to versions. Renaming therefore creates a new version rather than changing history. Every lifecycle operation, including archive and restore, advances the current-version reference. Versions do not store calculated EBITDA, cash flows, IRR or MOIC. Readers calculate from the approved input contract when needed.

A composite foreign key binds each version to its budget, organization and project. A deferred composite foreign key ensures the current version belongs to that exact budget. Organization/project references use `ON DELETE RESTRICT`, and ownership/history triggers prevent reassignment or ordinary deletion. Existing project soft deletion continues to work and hides budgets/history through RLS. **Hard deletion of a project or organization with budget history is intentionally restricted**: it must not cascade away immutable financial history. A separately authorized retention/purge process would be needed for permanent removal.

Source scenario and assumption-version UUIDs, original version number, calculation tag and raw assumptions are historical metadata with no foreign key to deletable source rows. Deleting an ordinary source scenario therefore preserves both provenance and the frozen inheritance used by every existing budget version. Duplication provenance similarly records the original budget/version identities without authorizing a cross-project copy.

## Input and serialization contract

`external-budget-persistence.ts` defines the versioned document and command schemas, `BudgetHeader`, `BudgetVersion`, `BudgetSaveResult` and the transport-independent orchestration. `external-budget-database.ts` supplies additive Supabase types without editing the generated legacy client types.

The document contains a name, nullable description, source information and Stage 1 financial input. Financial values are never inferred or normalized. Drafts may omit CAPEX, annual values, accounting confirmations and inheritance; supplied numeric values must still be finite and nonnegative. Incomplete fields are omitted, not replaced with zero or null. As in the approved Stage 1 type, an unconfirmed accounting flag is omitted; a stored confirmation must be `true`.

Draft preparation does **not** invoke the financial engine. Source binding can still validate and freeze calculation-relevant settings without producing a forecast. Complete versions must pass the existing Stage 1 validator/calculation, including ten explicit annual rows and all approved accounting confirmations. Calculated results are discarded; only inputs are persisted. Plain JSON checks reject values that serialization would silently change, including explicit undefined, nonfinite numbers, sparse arrays and class instances.

Incoming write documents cannot supply an inheritance snapshot, author, organization identity or duplication provenance. On create/refresh, the server reads the exact authorized source assumption row and calls `captureInheritance`. On save, it retains the current snapshot. Explicit refresh is the only way to replace inherited assumptions and must use the linked scenario; an unlinked draft may bind its first scenario through refresh.

Metadata `sourceInfo` is stored as text, not fetched from an external URL. No source URL causes a server network request.

## Authenticated server and database boundary

```text
Caller JWT
  → existing requireSupabaseAuth middleware
  → strict command validation (no caller-supplied actor or inheritance)
  → caller-RLS source/current-version reads
  → trusted capture or pinned inheritance
  → Stage 1 validation for completion
  → server-only admin client
  → write_external_budget RPC restricted to service_role
  → independent organization/project/source/CAS checks
  → atomic immutable append and current-version update
```

`external-budget.functions.ts` exposes typed create/save/refresh/duplicate/archive/restore functions using the existing authentication middleware. The privileged module is dynamically imported inside the server handler. `external-budget.server.ts` uses the repository's existing server-only admin client; no service credential is accepted as input or exposed to browser clients. The actor UUID comes exclusively from verified middleware context, never request data.

`external-budget-data.ts` provides caller-JWT/RLS list, history and exact-version reads. A version UUID remains explicit, so an ordinary read does not silently substitute the latest version. Archived budgets remain readable to authorized members; the list helper excludes them by default unless requested.

| Principal | Read new tables | Direct table writes | Execute lifecycle RPC |
| --- | --- | --- | --- |
| Anonymous | Denied | Denied | Denied |
| Authenticated member, viewer | Own active-project organization data | Denied | Denied; authenticated server endpoint ultimately rejects writes via editor/admin check. |
| Authenticated editor/admin | Own active-project organization data | Denied | Denied directly; writes go through the authenticated server endpoint. |
| Trusted server service role | Privileged read | Denied by explicit table grants | Allowed, with explicit actor/project authorization and relationship checks. |
| Migration/table owner | Privileged administration | Owner privileges remain trusted | Privileged administration remains trusted. |

The `SECURITY DEFINER` RPC has a fixed `pg_catalog, public, pg_temp` search path and fully qualified application relations/helpers. It checks the actor's editor/admin membership, locks the membership and active project against concurrent changes, validates budget ownership and independently verifies captured source identity, version, raw assumptions and calculation tag against live rows in that project. Its execution grant is restricted to `service_role`; all public/anonymous/authenticated execution grants are revoked. Both new tables have SELECT-only application grants and no authenticated write policies.

**Full financial completion validation and canonical snapshot capture are trusted-server responsibilities.** SQL does not duplicate the TypeScript financial engine. The RPC must never be granted to browser roles: doing so would let an untrusted caller claim an actor or bypass that validation boundary. Database checks independently protect authorization and relationships, but they do not make a compromised service credential safe. Managed JWT/PostgREST integration and production role parity remain release prerequisites.

## Transactional lifecycle

| Operation | Behavior |
| --- | --- |
| Create | Atomically create header plus version 1. Draft may have no source. A complete version requires a verified captured source. |
| Save draft or complete | Append a version, keeping original source identity and pinned inheritance. Completion uses the same save operation with explicit complete status. |
| Duplicate | Require the same project and expected source current-version UUID. Create a new active budget with version 1, copied inputs and original source plus duplication provenance. |
| Refresh | Read the explicitly selected source version; verify the linked scenario; capture a new snapshot and append a version. Existing versions never change. |
| Archive or restore | Append an immutable event/version and change the header archival state atomically. Saves/refreshes of archived budgets are rejected until restore. |
| History | Read exact versions and their original authors, timestamps, names, inputs and provenance. |

Every existing-budget command supplies the expected current-version UUID. The RPC locks the header `FOR UPDATE`, compares that UUID and appends the next sequential version in the same transaction. A stale write raises SQLSTATE `40001`, mapped to `BudgetConflictError`; it is never automatically retried or rebased. Application prechecks improve the error message, but the database comparison is authoritative if a race occurs after the read. A failed insert rolls back both header and version changes. Create/duplicate also have no automatic retries; after an uncertain network response, inspect existing identities before repeating the action.

Refreshing after source deletion fails explicitly. Saving or duplicating an already pinned budget does not reread the deleted source and remains reproducible. Source edits/new assumption versions cannot implicitly refresh any saved budget.

## Migration and recovery plan

The new migration is `drizzle/migrations/0014_external_budget_persistence.sql`. Journal entries 0000–0013 are preserved; entry 0014 is appended with a later timestamp. `0014_snapshot.json` has `prevId = 3689de60-92bc-487e-b807-5a9763e37e79`, the actual 0013 snapshot identity. `drizzle-kit check` passes.

The repository intentionally uses handwritten SQL with a blank `drizzle/schema.ts` and empty schema inventories in its historical snapshots. This migration preserves that convention and lineage. The metadata check verifies ordering/lineage, **not** deployed SQL schema parity; isolated SQL execution is separate evidence. No earlier migration or historical assumption is rewritten.

Before any later production application:

1. Review this PR and the exact migration hash recorded in the PostgreSQL evidence. Inspect journal lineage and every pending migration; stop if files/ledger/history differ from the approved plan.
2. Verify a current backup and restoration access. Confirm the managed runner's transaction behavior and execution identity; do not assume the in-memory rehearsal proves Lovable runner behavior.
3. In an isolated managed staging environment, verify actual middleware JWT handling, PostgREST function privileges, server service-role configuration, table/function ownership and role flags. Test anonymous/viewer/editor/admin access and attempts to forge actor, source and snapshot fields through real endpoints.
4. Exercise two independent native PostgreSQL sessions editing the same current version, plus role removal/project deletion contention, and verify exactly one eligible append succeeds without partial writes.
5. Obtain separate approval for the reviewed migration execution. Use the separately agreed Lovable migration-runner procedure; no companion migration is generated in this stage.
6. Verify grants, RLS, immutable-history guards, source proof, counts and unchanged existing assumptions after authorized execution. App publication is a separate approval/action.

The recovery artifact `scripts/sql/phase2b-disable-external-budget-writes.sql` revokes RPC execution from `service_role` while retaining tables, all versions, provenance, current pointers, RLS and member reads. It is **not** registered as a pending migration. Isolated rehearsal confirms writes stop and history stays readable. Re-enable only after a separately reviewed fix and authorization. Dropping tables, deleting history, rewinding the migration ledger or restoring a backup over later budget writes is not the default rollback. No production recovery operation has been performed.

## Verification and limits

The Stage 1 baseline is 636 passing tests under Node 24.19.0. All original tests, golden fixtures, financial engine files, funding defaults, saved-project data structures and older migration SQL remain unchanged. New tests cover strict serialization, incomplete drafts without calculation, capture/pinning/refresh, stale versions, and actor/provenance override rejection.

The opt-in database test runs the actual repository migrations and lifecycle orchestration against **PostgreSQL 18.6 in PGlite 0.5.10**, using synthetic organizations, members, projects and assumptions. It exercises real PostgreSQL privileges, RLS, constraints, triggers, transactional rollback and the recovery artifact. It is not a mocked database. The detailed checks and exact SQL/recovery hashes are in [the PostgreSQL evidence](stage2-postgresql-results.json).

Reproduce using the pinned Node and an independently installed PGlite 0.5.10 module; no application dependency or lockfile change is needed:

```sh
EXTERNAL_BUDGET_PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node scripts/test-financial-baseline.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src/lib/external-budget-persistence.ts src/lib/external-budget-database.ts src/lib/external-budget-data.ts src/lib/external-budget.server.ts src/lib/external-budget.functions.ts src/test/external-budget-persistence.test.ts
node node_modules/drizzle-kit/bin.cjs check --config drizzle.config.ts
node node_modules/vite/bin/vite.js build
```

Without `EXTERNAL_BUDGET_PGLITE_MODULE`, the database integration test is explicitly skipped; a default test pass alone is not database-security acceptance. The harness accepts only a local module path, creates an in-memory database and never consumes a production connection URL. It uses synthetic auth claims and minimal auth/storage schemas. Managed Supabase authentication/PostgREST behavior, exact production role/owner parity, native multi-session lock contention and backup restoration remain unverified. No external-budget UI, comparison page, production access, migration, publication or deployment is included.

## Recorded acceptance evidence

| Check | Result |
| --- | --- |
| Pre-edit main baseline | 636/636 passed under Node 24.19.0. |
| Final complete configured suite | 662/662 passed, 55 test files, zero failures/skips: all 636 baseline cases plus 26 persistence/integration cases. |
| Actual isolated PostgreSQL assertions | 65 passed, including the exact migration and history-preserving recovery artifact. |
| TypeScript | Passed. |
| Default lint on all six new TypeScript files | Passed; no repository lint configuration change. |
| Rehearsal script syntax and execution | Passed. |
| Drizzle metadata check | Passed; prior journal entries and SQL/snapshots unchanged. |
| Local production build | Passed; no deployment executed. The generated public JavaScript contains no service-role environment-key identifier. |
| Protected-source comparison | Every pre-existing source/test/fixture file and dependency manifest matches the starting main byte-for-byte. The only modified pre-existing migration metadata is the append-only journal. |

Migration SHA-256: `8b2d437a48bb3a4ed4726eb42bdd3b3889ae6c622edfad5a575ab478c7ea7f26`.

Changed-file groups:

- Schema: `0014_external_budget_persistence.sql`, `meta/0014_snapshot.json`, and the appended migration journal entry.
- Application: `external-budget-persistence.ts`, `external-budget-database.ts`, `external-budget-data.ts`, `external-budget.server.ts`, `external-budget.functions.ts`.
- Tests/recovery: `external-budget-persistence.test.ts`, `rehearse-external-budget-persistence.mjs`, and `phase2b-disable-external-budget-writes.sql`.
- Documentation/evidence: this plan and `stage2-postgresql-results.json`.

The implementation is ready for draft code/security review. Production release remains **NO-GO** pending the managed authentication/PostgREST, actual role/ownership and native concurrency checks above, operational preflight and separate migration/publication approvals. No Stage 3 UI work is included.
