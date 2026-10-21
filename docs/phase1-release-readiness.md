# Phase 1 release-readiness update — 21 October 2026

## Recommendation

**NO-GO for merge/release until the remaining operational gates below are resolved.** The validation compatibility blocker is resolved in this PR update. This is not permission to merge, deploy or execute a migration.

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

This supersedes the earlier unknown deployment status. Codex did not independently connect to production. Whether existing scenario assumptions were affected is still unknown; a pattern matching the injected rates does not prove who supplied them. Do not backfill or restore any assumptions without separate approval and provenance review.

## Remaining blockers and prerequisites

1. **Existing scenario impact:** an authorized read-only inspection must establish candidate scenarios, relevant version transitions and migration timing. Confirm inspection role coverage/RLS before treating a count of zero as comprehensive. Retain user-entered rates; obtain separate approval for any historical correction.
2. **Migration execution on GitHub sync:** establish the actual Lovable workspace behaviour, synced branch, migration permissions, runner and external deployment integrations. Repository inspection alone cannot guarantee that merging main will not execute backend SQL. An unpublished frontend is not a database isolation boundary. Keep this PR in draft until that boundary is confirmed.
3. **Deployed seed definition and migration history:** capture the current seed function/hash and applied migration ledger. The prepared migration refuses an unrecognized seed body. Confirm 0012 is the only intended pending migration and ensure transactional execution through the approved runner.
4. **Isolated staging release rehearsal:** use a genuinely separate backend to test signup, save/reload, benchmark fallbacks and the migration/rollback sequence. A Lovable code branch or draft must not be assumed to provide a separate database.
5. **Explicit release authorization:** review the updated PR and establish the desired approval gate on main. No merge, migration, deployment, rollback or production-record change is authorized by this report.

Relevant vendor documentation, checked in the preceding assessment: [Lovable GitHub sync](https://docs.lovable.dev/integrations/github), [Lovable database and migrations](https://docs.lovable.dev/features/database), [Lovable publishing](https://docs.lovable.dev/features/publish), [Drizzle migrations](https://orm.drizzle.team/docs/drizzle-kit-migrate). Documentation describes product capabilities; workspace-specific settings still need confirmation.
