# Phase 1 release-readiness update — 21 October 2026

## Recommendation — superseded 22 October 2026

**GO for a controlled migration-first release within the reviewed repository client history, subject to operational preflight and separate approvals.** Historical compatibility checks resolve the earlier exact-published-commit blocker: 24 save/dependency combinations (five save implementations, tags v1–v5), 20 engine snapshots, 14 templates and 16 auth source snapshots show no migration-induced incompatibility. Unknown/untracked clients remain outside this conclusion. No merge, migration or publication is authorized by the assessment.

See [final backward-compatibility assessment](phase1-backward-compatibility.md) and [historical test evidence](phase1-historical-client-results.json) for the scope, expected missing-F&B-list save correction, limitations and controlled sequence. The prior NO-GO text below records earlier evidence stages and is superseded by this final assessment.

## Production migration ledger comparison

The supplied 12-row export matches repository migrations **0000–0011** by exact SQL SHA-256 and exact journal timestamps, with no observed history discrepancies. **0012 is pending in the exported ledger.** Numeric ledger IDs were not used to infer filenames. See [full comparison](phase1-production-migration-comparison.md). The latest `created_at` is a journal timestamp, not proof of actual execution time. This resolves the ledger-comparison evidence gate; older requests below for obtaining that ledger are superseded. The user subsequently confirmed synchronization does not execute Drizzle migrations and publication is separate.

## Validation compatibility resolved

- Standard CAPEX item quantities and unit costs may be signed, supporting supplier rebates, credits and returned quantities. Each number and the resulting net investment must be finite. Net CAPEX and total investment after contingency must be nonnegative. Zero investment remains supported. No input lines are netted, clamped, deleted or rewritten.
- Validation runs after the existing advanced resolver and follows the selected revenue/OPEX method. Advanced Operations replaces the standard cable fixed/variable costs. Within an operations category, fixed, variable and step inputs are checked only when that category's selected method uses them.
- Explicit annual, per-passenger, per-passenger-series and frozen benchmark revenue methods ignore inactive manual revenue amounts. Explicit OPEX methods ignore inactive manual OPEX and merchandise cost-share inputs. Benchmark fallback amounts are still validated when a usable snapshot is absent.
- A positive Year 1 manual revenue amount is still validated if legacy OPEX uses it as its ratio denominator. Setting an explicit revenue method does not automatically remove that dependency.
- Revenue growth, OPEX growth and fallback cost inflation are validated only for the methods using them. Cable growth remains active for positive maintenance CAPEX, even when Advanced Operations has its own inflation. With maintenance disabled, the engine returns its existing zero maintenance outflow without evaluating an unused cable index.
- The validation compatibility changes did not alter the UI, persistence or modelling features; the later seed migration revision is documented below. Existing ticket-linking/resolution behaviour remains unchanged and operates on derived inputs; validation does not mutate or save assumptions.

## Financial evidence and verification

- Follow-up baseline: 449 tests across 49 files passed before changes.
- The first 39 compatibility regressions were run before the fixes: 18 failed and 21 passed, reproducing the over-restrictive validation. Additional coverage brings the compatibility suite to 45 tests.
- Full final suite: **494 tests across 50 files passed**, with no skips or failures. TypeScript, targeted lint and local build passed. Build warnings remain the existing chunk-size/inlineDynamicImports warnings.
- Ten local repository fixtures preserve the complete engine result exactly, checked against pre-change SHA-256 fingerprints plus explicit Year 3 EBITDA, Year 8 IRR/MOIC and full equity cash-flow series. These are repository fixtures, not a production database inventory.
- Independent financial references remain unchanged: Year 3 EBITDA 200; Year 8 equity IRR 17.26669593%; MOIC 3.576x; equity flows `[-400,0,0,0,0,0,0,0,1430.40]`; project FCF 160/year and project IRR 16% after the previously approved maintenance correction.
- New credit example: equipment 1,000 less rebate 100 gives CAPEX 900, debt 540, equity 360, Year 3 EBITDA 200 and exit equity 1,515.36. A negative-quantity credit produces the identical result; credits exceeding gross investment are rejected.
- No production data was accessed. No database migration was executed during the validation compatibility follow-up. The later seed investigation revised only unapplied 0012 and its rollback, and rehearsed both in disposable PostgreSQL; see the superseding evidence below.

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

## Superseding seed drift investigation and release checks

The new user-supplied function export resolves the seed-body evidence gap. Production body MD5 is `dba5cac31a644e281737569429904ec6`; `b959a14314626e9a06da94947f57ff18` in the export is the full-definition MD5. Production adds invitation onboarding and uses a 15-year sample. These changes are not represented in the reviewed migration chain.

The earlier 0012 was incompatible and failed closed. Revised 0012 preserves the actual reviewed body and adds only explicit F&B seed defaults; guarded rollback restores its matching original. **30 production-body rehearsal checks and 26 repository-body checks pass**, including invitations before/apply/rollback, unchanged existing rows/entities, signup, fail-closed guards and reapplication. Full financial tests pass **494/494**. Current production expected post-migration body MD5: `16f91e1d10c86c988cf9713e8fba778e`.

The exact live artifact remains unidentified; the later historical compatibility assessment establishes a bounded controlled GO without requiring an exact SHA. No production action is authorized. Fresh preflight/runner/backup checks and explicit merge/migration/publish approvals remain required release steps.

The user confirms backups (latest visible 21 October 2026 04:58:08 UTC), no automatic Drizzle execution on GitHub sync, and separate frontend publishing. These are no longer unknown blockers. No restoration was rehearsed. The supplied ledger remains consistent for 0000–0011; only unapplied 0012 was revised.

See [full investigation, evidence, limitations and controlled sequence](phase1-seed-drift-investigation.md), [production-body results](phase1-production-seed-rehearsal-results.json) and [repository-body results](phase1-release-rehearsal-results.json). Prior function compatibility findings are superseded by this assessment.
