# Phase 1 migration-runner sequencing — 22 October 2026

## Decision and scope

**NO-GO for the proposed “apply first, merge second, reconcile later” procedure as currently specified.** The SQL and historical-client compatibility remain technically validated. The open blocker is execution/artifact sequencing: no actual Lovable-generated SQL/journal/snapshot artifact, byte-preservation guarantee, pre-execution review boundary or managed runner version has been supplied.

Applying before frontend publication remains backward compatible within the reviewed client history. That does not make two divergent migration histories safe. The proposed order is conditionally viable only with one canonical migration identity, exact pre-approved SQL and deterministic reconciliation below. Keep PR #1 draft; no production operation is authorized here.

This investigation used repository/source inspection, exact hashing, temporary-file Git conflict simulation and static pending-selection assertions. **No SQL was executed, including in an isolated database.** No migration generation/check/apply command was run. No production access, merge or publication occurred. Only development-branch release documentation changed; prior 494 financial tests, 30 production-seed and 26 original-seed checks remain earlier evidence, not newly executed tests.

## Current evidence

| Item | Observed or reported value |
|---|---|
| Reviewed PR SQL | `drizzle/migrations/0012_preserve_saved_fb_opex_growth.sql` |
| SHA-256, independently rechecked | `0880280944d60caed0b5cca5c588aa6ba40d1bf71d0c1f56023fcdbdc3690c7d` (H) |
| PR journal identity | idx 12; tag `0012_preserve_saved_fb_opex_growth`; when **1792585200000** (P) |
| Main baseline | `5ca84c7042dabb18276c920d31cf193e5480e257`; journal entries 0000–0011 only |
| Latest previously matched ledger timestamp | **1792417990011** (0011), from supplied export; not an execution clock |
| Current user-reported preflight | Expected production seed hash; authentication and F&B triggers enabled; 12 ledger records |
| Fresh user-reported backup | **22 October 2026, 05:00:18 UTC**; recovery-point/restore verification remains an operator task |
| Installed local tools | drizzle-orm **0.45.4**; drizzle-kit **0.31.11**; journal version 7 |
| Lovable migration-tool contract | User reports: accepts SQL text, generates migration + journal, checks, applies pending; cannot select an existing SQL file by path |
| Unavailable evidence | Actual generated SQL/tag/when/snapshot/commit; managed runner version; whether generation can pause before execution; guarantees about SQL copying and transaction/retry behavior |

The fresh preflight/backup confirmation resolves those earlier evidence-collection tasks, but must be rechecked at execution if state changes. It does not establish generator byte identity or make a second correction safe.

## What the installed runner actually does

Local primary evidence:

- `node_modules/drizzle-orm/migrator.js`: follows `_journal.json`, loads each tag's SQL, splits on `--> statement-breakpoint`, hashes the SQL text with SHA-256, and carries journal `when` as `folderMillis`.
- `node_modules/drizzle-orm/pg-core/dialect.js:44`: reads the greatest ledger `created_at` once, then selects every journal entry with a strictly greater timestamp. It does **not** deduplicate by hash, filename, numeric ID or resulting schema. The initial high-water mark stays fixed while the selected batch runs.
- That PostgreSQL implementation runs the selected SQL and ledger inserts in one transaction. This is local-version evidence, not a guarantee about a different managed wrapper/version. Ledger/schema creation is outside that transaction; the existing production ledger already exists.
- Installed drizzle-kit PostgreSQL migrate delegates to the ORM driver migrator. Its generation writer appends a new `when` using the generation clock, chooses the next journal idx, writes a snapshot and SQL. Its custom-generation path starts with a placeholder comment; the Lovable wrapper's subsequent replacement/copying code is not available.
- Installed `checkHandler` inspects snapshot consistency/collisions and warns on non-increasing journal timestamps. It does not query production, compare ledger SQL hashes or execute/validate this DO block. A timestamp warning alone need not make it exit unsuccessfully.
- `drizzle/schema.ts` is intentionally blank; tracked schema snapshots contain empty table maps. Passing `check` cannot certify that the seed/trigger SQL matches the actual schema or that only the intended correction will execute.

Vendor context: [Drizzle check](https://orm.drizzle.team/docs/drizzle-kit-check) describes migration-history consistency checks; [Drizzle migrate](https://orm.drizzle.team/docs/drizzle-kit-migrate) describes applying/logging pending migrations. Current online documentation may describe newer formats, so this assessment uses the installed version-7 implementation for exact selection rules. [Lovable database documentation](https://docs.lovable.dev/features/database) describes tracked migrations but does not supply a byte-preservation promise for this tool. Confirm the managed versions and behavior rather than upgrading tools during release.

## Why naive sequences fail

| Sequence | Consequence under the inspected runner | Required response |
|---|---|---|
| Merge PR's P first, then give the tool the same correction SQL again | Tool likely appends a second correction G (often prefix 0013). Both timestamps exceed the original ledger high-water mark. Both are selected even if hashes are identical. First changes the seed/removes the F&B trigger; second fails its original-state guard. Standard transaction would roll back the selected batch. | Do not send the correction SQL again when P is already pending. Do not assume the managed wrapper's rollback without verification. |
| Generate/apply G on a clean 0000–0011 history, then blindly merge P as well, with G.when > P.when | A later runner skips P due to high-water mark, without proving P is represented in the ledger. Repository contains two logical corrections; a clean replay selects both and fails. | Remove the unapplied P candidate from the final branch; retain G's exact canonical artifacts. |
| Same order but P.when > G.when | Later runner selects P again; the seed guard rejects reapplication. | Stop; do not fix this by changing guards or ledger timestamps. |
| Same SQL filename/content on both branches, different journal `when` | SQL may merge without conflict, while journal still conflicts or silently loses the applied timestamp if resolved incorrectly. | Preserve the applied/generated journal metadata exactly, not the old hand-created timestamp. |
| Different filenames or equal numeric prefixes | Git may retain both files; numeric names do not establish applied identity. | Exactly one correction file/journal entry in the final canonical route. Preserve generated tag/path. |
| Equal timestamps or out-of-order clock | Selection is timestamp-based; a required migration can be silently skipped, or duplicate entries can both be selected in the initial batch. | Require strictly increasing timestamps and exact ledger correspondence. |
| Run reviewed SQL manually in SQL Editor, then merge/run P | SQL Editor execution alone does not establish a normal Drizzle ledger entry; next runner may retry and fail. | Not a proposed workaround. Do not manually insert/update/delete production ledger rows. |
| Apply G, later edit its SQL to make the file hash equal H | The modified file no longer corresponds to the actually applied ledger hash. | Applied bytes and metadata are immutable. Review a different artifact before application, never cosmetically rewrite applied history. |

A temporary three-way merge of main's actual journal, the PR journal and a hypothetical generated idx-12 journal produced **a real Git conflict**. This was a file-only simulation, not an actual generated artifact. Pure selection assertions reproduced the cases above. The actual installed reader returned two entries for two tags with the same SQL hash; identical hashes do not collapse them. See `phase1-runner-sequencing-evidence.json`.

The guard is intentionally fail-closed: original seed body is accepted; post-migration `16f91e1d10c86c988cf9713e8fba778e` is not. Do not whitelist that body, remove trigger checks, insert dummy “already applied” ledger rows, or turn the correction into a silent no-op merely to hide duplicate history.

## Will generated SQL be byte-identical?

**Not established. No generated file has been supplied.** The input text being reviewed is not proof of the on-disk result. A wrapper may add a comment, final newline, statement separators, escaping or different line endings. Even harmless formatting changes alter the hash stored by the runner. A statement-breakpoint inserted inside the DO block can also change execution by splitting a required single block.

Static examples, not actual tool output:

- Reviewed bytes H: `0880280944d60caed0b5cca5c588aa6ba40d1bf71d0c1f56023fcdbdc3690c7d`.
- The same file with a generated comment prepended: `9d2efd987a942c35dfae855be37a577ab81775d3d7187eb08da2c006c4dff9f3`.
- LF changed to CRLF: `9a6a5fd4570b6e86431890668ef82305dfc17b350bcbd7d9e2feeeeed1ac91f3`.

For a single-generated-canonical route, obtain exact post-generation/pre-execution SQL bytes and metadata, compare SHA-256 to H and inspect the complete pending set. If bytes differ, stop: review the diff, execution-unit boundaries and changed hash, and obtain approval for that specific artifact (with renewed isolated rehearsal if material). Do not assert the old hash still approves different bytes. After execution compare the ledger to the exact applied file and journal, not to the submitted text alone.

If the tool cannot pause/export an exact artifact before executing, post-application hashing is useful evidence but **cannot retrospectively satisfy the pre-application approval gate**. Require a supported apply-only runner, a vendor-guaranteed auditable byte-preserving path with a review boundary, or the conditional companion option below. A staging example alone does not guarantee production copying unless the same deterministic generator/version/payload behavior is established.

## Route A — preferred: apply pending without generating

Ask Lovable/support or an authorized migration operator whether they can run the normal Drizzle migrate command in the managed environment against the reviewed checkout and existing folder/journal, **without** invoking the generate-and-apply tool. Standard migrate works from the configured folder; it does not require selecting a file by path. The reported tool limitation does not by itself establish whether this separate managed execution capability exists.

If available and approved:

1. Freeze the reviewed SQL hash and current PR revision; the sole pending entry must be P. Confirm no concurrent schema jobs and no tool/dependency upgrade.
2. With separate merge approval, merge the reviewed PR so the execution checkout contains that exact P, or use a supported authorized checkout without publishing. Confirm no automatic frontend publication/SQL execution on synchronization, as previously reported.
3. With separate migration approval, execute the normal pending-only runner using managed credentials kept inside the authorized environment. Do not expose a connection URL or supply secrets to Codex.
4. Expected normal outcome: one new ledger record, **13 total**, with hash H and created_at **1792585200000**. Numeric row ID is not used to infer filename. No generated 0013 is needed.
5. Verify catalog, row preservation, ledger and smoke checks; obtain separate frontend publication approval.

This preserves the already reviewed migration identity and requires no file reconciliation or production-history manipulation. Availability of the managed apply-only capability remains unconfirmed; do not claim Route A can be executed until confirmed.

## Route B — conditional generate/apply first, then reconcile

This is the precise conditional version of Lovable's recommendation. It is not approved by the current evidence.

### Before any production apply

1. Freeze concurrent migrations. Confirm the actual tool workspace/selected branch contains **only 0000–0011**, no P from the development branch, no unrelated pending SQL and no schema changes. Do not assume that selecting a branch creates an isolated database.
2. Obtain a supported generation-only/review pause or equivalent exact-artifact review boundary. Capture generated tag/path, idx, `when` Tg, SQL bytes, any new snapshot/metadata, and the pending list. Require Tg > **1792417990011** and unique/strictly increasing journal metadata. Neither numeric filename nor ledger row count proves this.
3. Require the generated SQL hash to be H, or separately review/approve a changed artifact as described above. Confirm only G is pending; confirm transactional apply/ledger behavior, managed runner version and failure/retry procedure. Approval must cover this exact G and snapshot/journal set.
4. With separate migration approval, apply **G once through its normal runner**. Expected result: one new ledger row (13 total), hash equal to G's exact bytes, created_at exactly Tg, expected seed/trigger state and unchanged historical rows. Capture logs/artifacts and the synchronized Git commit M. If generation/apply is inseparable and no acceptable pre-execution gate exists, stop before step 4.

### Reconcile before the final PR merge — never after blindly merging

5. Ensure M and all its generated files are synchronized/exported to the correct Git branch. Capture the exact committed artifacts; do not rename/reformat the applied SQL or regenerate metadata. Keep PR #1 draft and do not publish.
6. In `phase1/financial-integrity`, make a normal forward merge from the branch containing M. Preserve existing published Git history; no force-push/rebase/squash of already published commits. This future branch reconciliation is not performed in this assessment.
7. Resolve `_journal.json` to original entries 0000–0011 plus **G only**, keeping G's exact idx/tag/when/breakpoints/version. Keep every generated snapshot and its actual id/prevId lineage unchanged. Remove only the superseded **unapplied** P journal entry and SQL candidate from the proposed final branch. If G uses the same path, retain its exact bytes rather than deleting it. Do not remove/replace any applied 0000–0011 or G artifact. This is reconciliation of an unapplied development candidate, not editing production ledger history.
8. Check for orphan SQL, duplicate tags/idx/timestamps, two correction bodies under different names and snapshot parent collisions. Never resolve the journal by keeping both P and G, inventing a later timestamp, or retaining P's timestamp in place of Tg. No production ledger UPDATE/DELETE/INSERT is involved.
9. Update planning/fingerprint references to G's canonical identity and actual hash. Re-run offline history checks and the SQL/rollback rehearsal for the exact approved artifact on an isolated backend only after authorization for SQL testing; confirm the actual runner would select no migration on the already migrated database and one correction on the corresponding pre-migration history. The known untracked invitation schema still needs its reviewed fixture for a production-equivalent rebuild.
10. Commit reconciliation normally, update PR #1 and obtain fresh review/merge approval for the final diff. After approved merge, final folder/journal must retain the G that the ledger actually records. Do not invoke the generate-and-apply tool again to “finish” the merge. Publish only after separate approval and checks.

If SQL fails or file synchronization fails, stop and capture ledger/catalog/files read-only. Do not blindly invoke the tool again: it may generate another migration. Verify actual transaction outcome before retry/recovery. No automatic rollback is proposed.

## Route C — conditional fallback if only generate-and-apply exists

A potentially safer alternative to reconciling two copies of the correction is to merge the reviewed P first, then submit **a separately approved, genuinely harmless companion SQL statement** to the tool, not the correction again. For example, a no-effect query could produce a new 0013 while the normal runner applies pending P and the companion. This does not manually manipulate migration history.

This is an option requiring vendor confirmation and separate approval, **not an implemented workaround or a guaranteed supported capability**. Confirm the tool accepts such SQL, does not introspect/generate unrelated DDL, preserves existing P, appends only the approved companion, and executes the entire pending set with normal ledger transactions. It must not replace or skip P. If policy requires no extra migration entry at all, use Route A or a reviewed canonical Route B instead.

Required invariants if explicitly selected:

- Existing P remains exactly H with when **1792585200000**, one correction only. The generated companion must contain no correction SQL, no data/DDL mutation, no ledger manipulation and no calls to the seed function. It is documented transparently as a runner companion, not disguised as a financial migration.
- Generated companion timestamp must exceed P's timestamp. Pending set must be exactly P + companion. Separate approvals cover merge, this two-entry execution plan and publication. There is **no approval here for even a no-op SQL execution**.
- Expected natural outcome is **14 ledger records**, two legitimate additions: H/P.when and the companion's real hash/when. This is not a duplicate correction. Preserve both generated artifacts and metadata, and record actual SQL/hash/snapshot evidence. Do not try to force the count back to 13.
- The reviewed correction stays unchanged and no add/add journal conflict against a separately generated correction is created. The companion's permanent audit/snapshot overhead is the tradeoff.
- Require a known failure/retry path. Stop on failure rather than generating another companion. If the tool cannot expose/guarantee the exact companion and pending set, cannot support normal ledger handling, or refuses the no-effect statement, this route remains unavailable.

Route C avoids relying on the generator reproducing the financial SQL because it reads already reviewed P from disk. It still requires confirmation that the tool does exactly this, not an assumption that any prompt saying “no-op” makes it safe. No no-op migration file/journal entry is added to the repository by this assessment.

## Operator checklist — explicit approvals and stop conditions

| Gate | Required evidence/action | Approval / stop condition |
|---|---|---|
| 0. Choose route | Written confirmation of Route A capability, or Route B exact artifact gate, or Route C companion support; managed runner/version and failure semantics | **NO-GO until one route is concrete.** No SQL tool call to discover behavior on production. |
| 1. Freeze and review | Reviewed commit/hash, actual selected branch/journal, expected pending list, no concurrent schema jobs | Planning/artifact approval only. Stop on unexpected pending SQL, workspace branch, hash, timestamp or snapshot lineage. |
| 2. Fresh preflight | Expected original seed; enabled auth and F&B triggers; invitation dependencies; 12 matched ledger rows; migration-role permissions; backup/recovery point and row-verification plan | Authorized read-only inspection. User reports backup 2026-10-22 05:00:18 UTC and expected catalog/counts. Stop on drift, unsuitable recovery point or unclear ownership/permissions. |
| 3. Merge gate | Exact order selected above; current PR reviewed (for B, reconcile after G but before final merge) | Separate **merge approval**. PR stays draft until authorized. Never combine with publication. |
| 4. Migration gate | Exact executable artifact(s), timestamps/hashes and complete pending list; transactional ledger workflow; agreed write pause | Separate **production migration approval**. Stop if generation cannot be reviewed/guaranteed, duplicates appear, or tool proposes ledger edits/reapplication. |
| 5. Post-apply gate | Correct seed body `16f91e1d10c86c988cf9713e8fba778e`, auth intact, only F&B insert trigger absent, unchanged historical records; ledger/file correspondence | Stop on any mismatch, unexpected total, failed/partial execution or missing generated commit. Do not regenerate or rerun blindly. |
| 6. Git reconciliation | Route-specific canonical artifacts preserved; no unapplied duplicate P/G, no snapshot conflict; exact reviewed final diff | Fresh review/merge approval if diff changed. Never edit the applied SQL or production ledger to make Git look tidy. |
| 7. Frontend | Approved backend and merged revision, separately authorized disposable smoke tests, corrected financial references | Separate **publication approval**, then resume writes/monitor as agreed. No automatic publish. |
| 8. Recovery | Actual failed state captured; known catalog/ledger-aware rollback/forward plan; backup consequences understood | Separate **recovery/rollback approval**. Restoring SQL state does not remove ledger rows; do not delete/repair history ad hoc. |

### Exact remaining answers needed from Lovable/operator

1. Can an authorized managed operation run normal `drizzle-kit migrate` without generation against the existing reviewed journal/folder? If yes, specify runner/version/checkout and approval boundary.
2. Otherwise, can generation pause before execution and export exact SQL/journal/snapshots, or can an equivalent auditable byte-preserving pre-execution guarantee be supplied? An actual artifact is required to answer byte-identity conclusively.
3. If neither, is a separately approved harmless companion supported, with existing P retained and P + companion as the entire pending set? Provide exact generated output/pending-set guarantees and failure/retry behavior.
4. Where will generated files be committed/synchronized, and can that be locked against concurrent migrations until reconciliation? What version/driver executes SQL and are all pending SQL plus their ledger inserts atomic?

Earlier technical compatibility GO is unchanged, but operational execution is **NO-GO pending these sequencing gates**. This assessment did not change migration SQL, financial code, tests or production history. PR #1 remains draft.
