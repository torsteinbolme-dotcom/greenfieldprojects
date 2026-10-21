# Phase 1 release-readiness update — 21 October 2026

## Recommendation

**Conditional technical readiness: isolated rehearsal and all 494 tests pass. NO-GO for production execution until the deployed seed-function evidence is verified and the release is explicitly approved.** Lovable synchronization and backup availability are now user-confirmed; they are no longer unresolved blockers. The published artifact identity remains unverified, so application compatibility is demonstrated against the main-branch reference, not a live build.

## Production migration ledger comparison

The supplied 12-row export matches repository migrations **0000–0011** by exact SQL SHA-256 and exact journal timestamps, with no observed history discrepancies. **0012 is pending in the exported ledger.** Numeric ledger IDs were not used to infer filenames. See [full comparison](phase1-production-migration-comparison.md). The latest `created_at` is a journal timestamp, not proof of actual execution time. This resolves the ledger-comparison evidence gate; older requests below for obtaining that ledger are superseded. Actual Lovable synchronization/migration execution behaviour remains a release blocker.

## Validation compatibility resolved

- Standard CAPEX item quantities and unit costs may be signed, supporting supplier rebates, credits and returned quantities. Each number and the resulting net investment must be finite. Net CAPEX and total investment after contingency must be nonnegative. Zero investment remains supported. No input lines are netted, clamped, deleted or rewritten.
- Validation runs after the existing advanced resolver and follows the selected revenue/OPEX method. Advanced Operations replaces the standard cable fixed/variable costs. Within an operations category, fixed, variable and step inputs are checked only when that category's selected method uses them.
- Explicit annual, per-passenger, per-passenger-series and frozen benchmark revenue methods ignore inactive manual revenue amounts. Explicit OPEX methods ignore inactive manual OPEX and merchandise cost-share inputs. Benchmark fallback amounts are still validated when a usable snapshot is absent.
- A positive Year 1 manual revenue amount is still validated if legacy OPEX uses it as its ratio denominator. Setting an explicit revenue method does not automatically remove that dependency.
- Revenue growth, OPEX growth and fallback cost inflation are validated only for the methods using them. Cable growth remains active for positive maintenance CAPEX, even when Advanced Operations has its own inflation. With maintenance disabled, the engine returns its existing zero maintenance outflow without evaluating an unused cable index.
- No UI, persistence, migration or modelling feature was changed in this follow-up. Existing ticket-linking/resolution behaviour remains unchanged and operates on derived inputs; validation does not mutate or save assumptions.

## Financial evidence and verification

- Follow-up baseline: 449 tests across 49 files passed before changes.
- The first 39 compatibility regressions were run before the fixes: 18 failed and 21 passed, reproducing the over-restrictive validation. Additional coverage brings the compatibility suite to 45 tests.
- Full final suite: **494 tests across 50 files passed**, with no skips or failures. TypeScript, targeted lint and local build passed. Build warnings remain the existing chunk-size/inlineDynamicImports warnings.
- Ten local repository fixtures preserve the complete engine result exactly, checked against pre-change SHA-256 fingerprints plus explicit Year 3 EBITDA, Year 8 IRR/MOIC and full equity cash-flow series. These are repository fixtures, not a production database inventory.
- Independent financial references remain unchanged: Year 3 EBITDA 200; Year 8 equity IRR 17.26669593%; MOIC 3.576x; equity flows `[-400,0,0,0,0,0,0,0,1430.40]`; project FCF 160/year and project IRR 16% after the previously approved maintenance correction.
- New credit example: equipment 1,000 less rebate 100 gives CAPEX 900, debt 540, equity 360, Year 3 EBITDA 200 and exit equity 1,515.36. A negative-quantity credit produces the identical result; credits exceeding gross investment are rejected.
- No production data was accessed. No database migration was executed in this follow-up, including in a disposable database. The SQL migration and rollback are unchanged; their earlier disposable-database results remain historical evidence only.

## Production trigger: confirmed by the user

On 21 October 2026 the user reported an authorized inspection through Lovable Cloud SQL Editor confirming:

| Item | Confirmed value |
|---|---|
| Table | `public.scenario_assumptions` |
| Trigger | `default_fb_opex_growth` |
| Function | `default_fb_opex_growth` |
| Status | `O` — enabled for ordinary sessions |

This supersedes the earlier unknown deployment status. Codex did not independently connect to production.

### Authorized aggregate inspection results

The user subsequently reported these read-only Lovable Cloud SQL Editor results on 21 October 2026:

| Inspection metric | Reported result |
|---|---:|
| Total assumption versions | 306 |
| Legacy versions | 108 |
| Versions matching the trigger pattern | 1 |
| Candidate scenarios | 0 |

The inspection detected no candidate scenarios under the supplied heuristic. This is indicative, not conclusive proof of historical integrity. The one pattern-matching version may be a seed/default or user-entered value; its origin is not established. Legacy versions can remain unchanged because the trigger affects inserts rather than retrospectively updating older rows. The candidate query can miss first-version injections, cross-scenario copies and cases outside its exact pattern; it cannot reconstruct an unsaved draft. Inspection-role/RLS coverage and historical trigger timing were not supplied.

The requested aggregate inspection is now complete; it is no longer an outstanding evidence-collection task. There is no identified candidate justifying a historical repair or backfill. Preserve all historical assumptions. Further provenance work, if needed, must remain read-only unless separately authorized. The enabled trigger still justifies a prospective future-save correction.

## Release checks completed — 21 October 2026

### Operational confirmations supplied by the user

- Lovable Cloud production backups are available: latest visible backup **21 October 2026, 04:58:08 UTC**, plus backups on 20, 19 and 18 October. Availability is confirmed; restoration was not rehearsed. A recovery-point decision is still needed because the visible backup precedes later writes.
- Lovable confirmed GitHub synchronization **does not automatically execute Drizzle migrations** and frontend publishing is a separate action. This supersedes earlier uncertainty about migration-on-sync. No Cloud action was performed to test the confirmation.
- The exported ledger matches exact SQL hashes/timestamps for 0000–0011; 0012 alone is pending among the journal entries reviewed.

### Seed implementation, dependencies and guards

Migration 0000 defines the seed function; migrations 0001–0011 do not replace it. Its body MD5 is `9bc90882dbbe580fe2f2a21b9bc46ba1`, exactly the 0012 guard. The guard runs before trigger removal. An absent or changed function aborts; raw reapplication after success also aborts because the body has changed. Use a runner that respects its ledger rather than replaying raw SQL.

The isolated rehearsal replayed all 12 exact original SQL files, including relationship guards, constraints, RLS policies and the auth signup trigger. With the repository implementation, CREATE OR REPLACE preserves the seed function OID, owner, ACL, trigger return signature, security-definer setting and `search_path=public`. Existing auth/tenant triggers keep the same definitions and references. Only the F&B default insert trigger is removed; its function is retained for rollback. Runtime inserts into organizations, organization_members, projects, scenarios and scenario_assumptions succeed, and the signup example remains identical because its formerly injected defaults become explicit.

**Production-specific compatibility is not yet fully verified.** The deployed seed body/hash, ownership/settings and dependent triggers were not supplied. Matching migration hashes are strong historical correspondence, not proof against subsequent manual edits. The fail-closed guard prevents a blind replacement but is not a substitute for preflight review. Prepared read-only catalog inspection: `scripts/phase1-seed-compatibility-inspection.sql` (locally executed and checked, never run against production by Codex). PL/pgSQL runtime references are not all represented by pg_depend, so review the function definition as well as catalog dependencies. The updated repository body MD5 is `8bccc675f3dc982b131ebbb72d0055c1`.

### Isolated application and rollback rehearsal

Evidence: `docs/phase1-release-rehearsal-results.json`; reproducible harness: `scripts/rehearse-phase1-release.mjs`. **17 checks passed** in in-memory PostgreSQL 18.6 / PGlite 0.5.10. No network database connection, production records or credentials were used. Auth/storage were minimal local stubs; tests ran as privileged schema owner. This is PostgreSQL SQL/PLpgSQL execution, not a managed Supabase authentication or production-permission rehearsal.

- Apply preserved all **8** existing fixture rows exactly, including IDs, assumptions, metadata and timestamps. Historical financial outputs stayed identical within each engine.
- Six missing/empty/explicit/passenger-linked/benchmark F&B cases preserved exact JSON and complete financial outputs across insert/reload on both the Phase 1 engine and the main-branch reference engine.
- Signup produced identical example assumptions and engine outputs. RLS policy and constraint definitions were unchanged; non-target triggers were unchanged.
- Unknown and missing seed implementations failed closed before the target trigger could be removed.
- Rollback preserved all **15** rows present at that point, restored the original seed/catalog definitions, signup defaults and original trigger behaviour. Apply-after-rollback succeeded.
- The original defect was reproduced: a legacy Year 2 F&B OPEX of 112.75 became 102.50 after saving; after migration it remains 112.75.
- Full financial suite rerun: **494/494 tests passed, 0 failures, 0 skipped**. No financial source code, assumptions, SQL migration, dependency manifests or lockfiles were changed for this release assessment. Initial rehearsal-harness runs failed on virtual TypeScript loading/relative imports; the harness was corrected and the full rehearsal then passed. These were harness/environment failures, not migration failures.

### Compatibility with the published application

No database schema/API incompatibility was found against main reference `5ca84c7042dabb18276c920d31cf193e5480e257`: tables, columns, constraints and policies remain intact. `src/lib/data.ts` already appends versions using submitted assumptions; creation defaults remain in `src/lib/model.ts`. The older engine correctly understands missing/empty F&B growth and retains existing saved explicit lists. Thus applying the migration before frontend publication is compatible with the tested reference and fixes future save/reload behaviour immediately.

The exact published build SHA has not been supplied and no live application was accessed. Therefore this is source/reference compatibility evidence, not verification of the deployed artifact or a full browser/auth/RLS smoke test. The changed legacy save behaviour is the intended defect correction. Historical injected growth lists remain untouched. Cached clients based on this reference remain compatible. If the live build differs, verify its persistence/default logic and smoke-test it against a separate backend before proceeding.

## Proposed controlled deployment sequence — requires separate approval

1. Obtain/review the deployed seed hash/definition, owner/settings and auth/default-trigger definitions with the prepared read-only inspection. Expected original body hash: `9bc90882dbbe580fe2f2a21b9bc46ba1`. Confirm the published build corresponds to the tested reference or complete the isolated compatibility check for its actual revision. Stop on any mismatch.
2. Designate the authorized operator, migration runner and frontend release owner. Confirm only 0012 is pending immediately before release; freeze the reviewed SQL hash and application revision. Record rollback SQL, previous frontend artifact and a recovery plan. Select an acceptable backup recovery point; confirm restore access rather than assuming backup availability proves restorability.
3. With explicit merge approval, merge PR #1. Based on Lovable's supplied confirmation, synchronization alone neither applies this SQL nor publishes the frontend. Review the synchronized revision before the separately approved operations below.
4. In an agreed write-pause window, record a read-only before snapshot/fingerprint and count of existing assumptions. With separate migration approval, execute the reviewed 0012 through the established Drizzle transaction/ledger workflow. If Lovable uses manual SQL instead, first agree how the journal/ledger will be recorded: applying SQL alone must not leave a misleading pending migration or cause a guard failure on a later runner. Never delete/repair ledger entries ad hoc.
5. Before publishing, verify only the intended trigger is removed, the seed body/settings and ledger are correct, signup and save/reload work, and all pre-existing assumption rows are unchanged. Use authorized disposable release scenarios only; do not rewrite historical assumptions.
6. With separate publish approval, publish the reviewed frontend and run the agreed smoke tests for legacy/explicit F&B, comparisons and financial reference outputs. Resume writes after acceptance; monitor save failures and signup behaviour.
7. If rollback is needed, keep writes paused and review the runner history and actual catalog first. The supplied rollback restores the known save-time defect and does not reverse saved scenario versions. It is not idempotent (CREATE TRIGGER fails if already present) and has no drift guard: execute only against the verified post-0012 state with separate approval. Restore the reviewed prior frontend if required; verify rows and catalog afterwards. Plan any subsequent forward reapplication explicitly because the applied ledger entry remains. Full backup restore is an operator decision with potential loss of later writes, not an automatic rollback step.

## Remaining decision

The local code and migration candidate pass technical checks. The user-confirmed sync/publish separation and available backups remove earlier operational unknowns. **Final production GO remains conditional on the deployed seed preflight and published-build identification/compatibility confirmation.** No production access, record change, merge, publication or Cloud migration has occurred. This assessment does not authorize those actions.
