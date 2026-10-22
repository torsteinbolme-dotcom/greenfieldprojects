# Final Phase 1 backward-compatibility assessment — 22 October 2026

## New operational gate — migration-runner sequencing

Lovable reports its tool generates a new migration from SQL text before applying pending migrations. The [runner sequencing assessment](phase1-migration-runner-sequencing.md) makes execution operationally **NO-GO until a canonical artifact/runner route is confirmed**. The historical compatibility GO below is unchanged; it does not approve duplicate generation or unresolved ledger/Git reconciliation. No SQL was executed in that later assessment.

## Technical recommendation

**GO for a controlled, migration-first release of the reviewed candidate, subject to operational preflight and explicit release approvals.** No migration-induced incompatibility was found across the relevant available main-branch history. The missing exact published commit is no longer a technical blocker for this bounded database-interface assessment: the assessment covers all discovered save/onboarding families rather than only 5ca84c7.

This is not a claim to have identified or tested the live artifact. The conclusion is bounded to the reviewed history and the user-supplied Lovable confirmation that current working code differs from main 5ca84c7 only in generated previewAuthStorage.ts, with no saving/onboarding changes. A build with untracked database-write or onboarding logic outside that scope requires the specific additional verification described below. No production action is authorized or performed by this recommendation.

## Scope and evidence

- Available main ancestry through `5ca84c7042dabb18276c920d31cf193e5480e257`: **678 commits**, not a shallow checkout. Relevant source changes span 18–21 October 2026. Earlier prototypes without connected scenario persistence do not introduce a database contract to migrate.
- Actual historical source is loaded from Git, transpiled with TypeScript and executed locally. Runtime dependencies are resolved at each historical revision rather than substituted with current financial helpers.
- **24 save/dependency combinations** covering **5 distinct save function bodies**, all five calculation tags (`mountain-v1`, `mountain-v2`, `mountain-v3`, `mountain-v4-seasonal`, `mountain-v5-volume`). The composite history includes model/tag and ticket-linker changes even when data.ts itself did not change.
- **120 historical save/reload cases**, plus scenario and project creation for each combination, executed through a local Supabase-style API adapter against PostgreSQL as `authenticated`. Admin membership is real local RLS data. Viewer reads work and viewer writes are rejected.
- **20 distinct historical engine snapshots**, five save/reload cases each: **100 complete result comparisons**. **14 template/model snapshots** preserve their exact JSON and calculation results on database round trip.
- **16 authentication-related source snapshots** reviewed: 11 auth-page versions, 4 password-reset versions and 1 invite server-function version. **6 distinct historical growth-editor patterns** inspected for missing/empty list handling.
- Existing exported-production-seed rehearsal remains **30 passing checks**, original-seed rehearsal **26 passing checks**; these include before/apply/rollback invitation paths and exact preservation of historical assumptions and related entities. Full current financial test suite rerun: **494 passed; 0 failures; 0 skips**.

Machine-readable evidence, full commit/source fingerprints and limitations: [phase1-historical-client-results.json](phase1-historical-client-results.json). Reproduce with `node scripts/test-phase1-historical-clients.mjs /path/to/pglite/dist/index.js` (set PHASE1_GIT if the normal Git executable is unavailable). The database is in memory and the script accepts no connection URL.

## Relevant historical versions

| Family / introduction | Behavior and required interface | Effect of revised 0012 |
|---|---|---|
| Direct append, `ad2f4e9` | Read latest version; INSERT submitted JSON into scenario_assumptions; auth.getUser; audit insert | Same table, fields, version contract, role and JSON shape remain available |
| Nullable actor, `7583239` | Same append, with null fallback for created_by | Nullable actor column and grants unchanged |
| Session-based actor, `ff8ef68` | Uses auth.getSession instead of getUser | Auth provider/session interfaces untouched |
| Linked ticket pricing, `7768a3f` | Calls historical withLinkedTicketPrices before insert | Ticket derivation untouched; database preserves the exact submitted result |
| Read-error handling/retry, `a15ba07` | Fails on version-read error; retries 23505 collisions | Unique key, read policy and append behavior unchanged |
| Templates before `5319213` | May omit F&B growth; older engines support missing input | Lists stay missing rather than being silently injected; legacy draft semantics survive save |
| Creation defaults, `5319213`, then `7985c1c` | Explicit three-entry, then five-entry F&B defaults supplied by creation helper | Submitted lists persist exactly; migration does not shorten five entries |
| Basic auth, `d4fd1d1` onward | Password signup/signin, getSession/onAuthStateChange, OAuth; no invite metadata | Same managed auth APIs; unchanged auth.users AFTER INSERT trigger still creates ordinary user's organization/sample |
| Invitation-aware auth, `35e3290`, `f48e640`, `5dd7020` | invite_token metadata plus accept_invite RPC; later redirect changes | Production seed's invite early return/member role/acceptance preserved; RPC and redirects untouched |
| Password reset, `abc04e1`, `665470a`, `3480326` | auth.updateUser; later accepts invitation from user metadata | Password update is outside an INSERT trigger; RPC/signature/permissions unchanged |
| Invite sending, `ce06575` | Reads organization_invites and passes invite_token to auth invitation service | Invitation table, roles, token contract and service API unchanged |
| Seasonal/volume/advanced model revisions through main | Different calculation tags and optional assumptions, shared JSON persistence | No JSON schema constraint or tag enum introduced; existing fields preserved |

The earlier save implementations have pre-existing weaknesses (ignored read errors or no collision retry). Their persistence contract still works after migration; this assessment does not certify those older bugs as fixed. Redirect/session-storage differences are similarly outside the migrated database contract.

## Required database interfaces, triggers and permissions

Revised 0012 changes only the two reviewed seed bodies by adding explicit F&B example defaults and removes only `default_fb_opex_growth` on scenario_assumptions. It does not rename/drop columns, tables, views or RPCs; change data types, version keys, calculation tags, defaults on columns or constraints; or grant/revoke permissions. `latest_scenario_assumptions` and the append-only version model remain intact.

The migration keeps `on_auth_user_created` enabled with the same function OID and AFTER INSERT/FOR EACH ROW contract. CREATE OR REPLACE preserves owner/ACL and function settings. It retains production invitation handling, case-insensitive matching, ordinary organization/admin creation, Project Mountain, Base scenario, and the **15-year** seed. Both new signup and the sample's effective JSON/results are unchanged because the removed trigger's three default entries are now explicit only in seed creation. Production body MD5 transitions `dba5cac31a644e281737569429904ec6` → `16f91e1d10c86c988cf9713e8fba778e`.

Existing organization membership/RLS helper functions, relationship guards, audit records/policies and signup/accept-invite APIs remain. Table grants compare exactly before/after in the historical harness; owner/ACL/settings, RLS definitions, constraints and non-target triggers compare exactly in the existing full-schema rehearsal. The historical tests exercise authenticated saves/creates and the viewer read-only boundary; they do not simulate every managed production role configuration.

No reviewed historical client calls, introspects or requires the removed F&B trigger/function as a client API. The retained defaulting function remains available for the guarded rollback. Historical growth editors use optional/nullish fallbacks and guarded list access; missing lists do not introduce a required-field render dependency. This is source inspection, not a historical browser-render test.

## Incompatible revisions and intended behavior change

**No reviewed historical revision is incompatible because of revised 0012.** Existing saved JSON remains unchanged; explicit F&B lists still behave explicitly. Older engines either ignore the optional list or already support its missing/empty fallback. All 20 engine snapshots tested preserve complete outputs across round trip after migration.

The intentional future-save change must be communicated: an old frontend submitting missing/empty F&B growth no longer receives silent inflation defaults from the database. Its own draft assumptions are preserved. In the reference case, the former save defect changed Year 2 OPEX from **112.75 to 102.50**; migrated save/reload remains **112.75**. Existing stored explicit lists remain untouched. This is the demonstrated defect correction, not a hidden normalization or historical backfill.

A hypothetical client that depends on the database injecting that list for a newly created scenario would see different economics. None was found in the reviewed history: pre-default clients support legacy missing lists, later creation helpers provide explicit lists, and the sample is preserved by the revised seed. No evidence permits claiming safety for arbitrary untracked clients that bypass this contract.

The **earlier, superseded 0012 candidate** was incompatible with the exported production seed (guard rejection; removing invitation logic if bypassed). Do not use it or its old hash. Current revised migration SQL SHA-256 remains `0880280944d60caed0b5cca5c588aa6ba40d1bf71d0c1f56023fcdbdc3690c7d`; this assessment does not change SQL or financial code.

## Can migration precede frontend publication?

**Yes, for the reviewed client families.** The migrated database supplies the same client interfaces while correcting save-time mutation immediately. Cached older frontends can continue reading/saving; signup/invitation interfaces remain intact. A short controlled migration-first interval is supported by the evidence and does not require knowledge of the precise published SHA within this covered history.

This does not deliver the frontend maintenance-CAPEX, benchmark-price or validation corrections to an older cached application. Its existing calculation/validation bugs remain until users load the corrected frontend. Keep the interval controlled, finish publication, request client refresh and perform post-publication checks. An application rollback does not automatically restore the database; the reviewed database rollback restores the original save-time defect and requires separate approval and ledger planning.

## Operational preflight and controlled release sequence

These are execution prerequisites, not unresolved historical-code incompatibilities:

1. Approve/freeze the reviewed PR commit, current SQL hash and guarded rollback. Establish the authorized migration and publication operators. Record that the compatibility scope is the reviewed repository family; stop if there is evidence of a published/untracked client outside it.
2. Authorized read-only preflight immediately before execution: ledger still has only 0000–0011 applied; 0012 is the only pending journal entry; current seed/body and auth/F&B trigger definitions/enabled state match reviewed values; invitation dependencies and migration-role ownership/DDL permissions are suitable. The migration fails closed on known guard mismatches.
3. Confirm a current acceptable backup/recovery point and restore access. The last user-reported visible backup was 21 October 2026 04:58:08 UTC; do not assume this remains the latest backup on 22 October. Backup restoration has not been rehearsed by Codex. Agree write pause and before/after verification of pre-existing assumptions/entities.
4. With explicit approval, merge PR #1 and verify the synchronized code. User-supplied Lovable confirmation states synchronization does not execute Drizzle SQL and frontend publication is separate. Do not combine these approvals implicitly.
5. During the agreed write pause, separately approve/apply revised 0012 through the designated transactional runner/ledger workflow. If manual SQL is required, resolve correct ledger recording before execution. Never repair or delete applied history ad hoc.
6. Before publishing, verify expected seed body `16f91e1d10c86c988cf9713e8fba778e`, intact auth/other triggers, absent F&B insert trigger, correct ledger and unchanged historical rows. Run separately authorized disposable ordinary/invited signup and legacy/explicit save/reload smoke checks. No historical assumptions should be edited.
7. Separately approve/publish corrected frontend, check financial references and saving, refresh clients, then resume writes and monitor. On failure, keep writes paused, inspect catalog/ledger and use separately approved guarded rollback/prior frontend restoration. Do not restore a full backup automatically or silently discard later scenario versions.

## Exact remaining verification if the covered-history assumption is false

No further exact-commit identification is required to establish compatibility **within the covered history**. If the published build could contain saving/onboarding logic outside it, obtain a source or served-bundle extract of its scenario insert/update/normalization paths, auth signup invite metadata, invitation/password RPC names and any trigger/default dependency. Compare those contracts and exercise any new path in an isolated migrated backend. An authorized disposable live-client save/reload/signup smoke check can supplement that assessment after explicit approval; it is not authorized or performed here. A dashboard statement that only previewAuthStorage.ts differs in the current working tree is not proof that the live artifact equals that tree.

The precise published artifact remains unidentified; end-to-end managed auth/browser/production-RLS behavior is not certified by the local tests. The source/history coverage plus unchanged database contract supports the controlled GO above, not an unconditional promise about unknown code or an authorization to release.

Harness setup failures were corrected before final passing results: an invalid fixture scenario kind and unsupported JSON asset loading. Neither was a migration defect. No production access, production migration, PR merge or publication occurred. Work stays on `phase1/financial-integrity`.
