# Phase 1 — historical release record

Recorded 22 October 2026. This replaces older planning-status summaries as the release record; the linked assessments and machine evidence remain preserved. It does not authorize another merge, migration, rollback or publication.

## Release identities and evidence levels

| Item                    | Recorded value                                                                                                 | Evidence / limitation                                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository              | `torsteinbolme-dotcom/greenfieldprojects`                                                                      | GitHub source inspected                                                                                                                                    |
| Phase 1 PR              | [#1](https://github.com/torsteinbolme-dotcom/greenfieldprojects/pull/1), `phase1/financial-integrity` → `main` | Merged history inspected                                                                                                                                   |
| GitHub merge commit     | `2233545cabebc1dc8976c167aba146bd62974510`                                                                     | PR API confirms merge at 22 October 2026, 17:45:21 UTC; also parent of published source commit                                                             |
| Published Git revision  | `c18d1444998c58619e76e9e7fcbf7cb5e7d6b90f`                                                                     | GitHub main independently matched at baseline creation; live publication mapping supplied by user/Lovable                                                  |
| Production deployment   | `psr2.fed093c9-a422-49c9-81ea-98a8ce484239`                                                                    | Reported by Lovable through user; not independently queried                                                                                                |
| Production migrations   | 14 applied                                                                                                     | Reported by user; source journal also has 14 entries; no fresh production ledger export examined in this task                                              |
| Financial test baseline | 494/494 on Node 24                                                                                             | User's release report independently reproduced locally on Node 24.19.0 from published source and clean frozen-lock dependencies; see [testing](testing.md) |

The c 18 d source commit is a merge with parents 2233545… and b 003 a 2468 f 39663490 cc 79266 cbbdc 66256 b 07 a 3, retaining Phase 1 and generated companion metadata. Do not substitute the PR merge commit for the actual published source revision. Current-main verification is a point-in-time GitHub check; this baseline branch does not freeze future main changes.

## Migration source identities

| File                                                        | Journal idx / when | SHA-256 of actual repository bytes                                 |
| ----------------------------------------------------------- | ------------------ | ------------------------------------------------------------------ |
| `drizzle/migrations/0012_preserve_saved_fb_opex_growth.sql` | 12 /1792585200000  | `0880280944d60caed0b5cca5c588aa6ba40d1bf71d0c1f56023fcdbdc3690c7d` |
| `drizzle/migrations/0013_apply_pending_0012.sql`            | 13 /1792691630717  | `17db4fd369edb9244b9f91d9aeed145c3d04ad8ba6e95d06247f07a63527d11a` |

Actual 0013 is exactly `SELECT 1;` (9 bytes, no final newline). Journal 0000–0013 appears once each with increasing `when` values. Existing snapshot inventory is 0000–0011; **no 0012 or 0013 snapshot exists in this source revision**. SQL-only entries do not justify fabricating snapshots. Ledger serial IDs are not SQL filenames; source identities are hashes and journal timestamps. The production count alone does not independently prove every ledger hash or catalog object matches these bytes.

0012 removes the scenario-assumption INSERT trigger that silently defaulted missing/empty F&B OPEX growth; the defaulting function is retained. It updates `public.handle_new_user()` to seed explicit growth defaults while preserving the reviewed invitation/ordinary signup paths, organization creation and 15-year sample project. Existing scenario/assumption rows are not updated by this SQL.0013 is the harmless Route C companion; its intended database footprint is normal ledger bookkeeping, not business data changes. No migration files, journal metadata or snapshots are edited by the v1.0 baseline PR.

## Financial corrections released in Phase 1

- Unlevered project FCF now deducts maintenance CAPEX and computes tax on EBIT, independent of financing; project IRR/payback use it.
- Benchmark ticket-price comparison reads actual selected forecast-year pricing rather than Year 1 price.
- Saving no longer injects F&B OPEX growth defaults in the client; migration removes the corresponding database trigger and explicitly defaults new-user samples only.
- Active-method validation rejects invalid financial inputs without rejecting inactive standard costs/revenues replaced by advanced/explicit methods. Standard signed CAPEX credits are accepted if net investment is nonnegative.
- Independent regression cases protect Year 3 EBITDA, Year 8 equity returns, project/equity cash flows and persistence behavior.

Detailed before/after figures and original scope: [financial results](../phase1-financial-results.md). No additional financial corrections are introduced by this baseline.

## Historical evidence retained

Earlier read-only user-supplied inspection reported 306 assumption versions, 108 legacy versions, 1 trigger-pattern match and 0 candidate scenarios. This is **indicative, not conclusive proof of historical integrity**; no historical assumptions were repaired. The deployed pre-migration seed body differed from the original repository function; the reviewed migration accounted for the supplied production body (pre MD 5 `dba5cac31a644e281737569429904ec6`, expected post MD 5 `16f91e1d10c86c988cf9713e8fba778e`). Those identities are historical expected values, not freshly verified production state.

Prior local evidence includes 494 financial tests, 30 production-seed rehearsal checks, 26 original-seed checks and historical save/onboarding compatibility tests. See `phase1-production-seed-rehearsal-results.json`, `phase1-release-rehearsal-results.json`, `phase1-historical-client-results.json`, `phase1-route-c-evidence.json`, and historical markdown reports. Their original runtime/results remain unchanged. They are neither new production checks nor additions to the 494-test suite.

The [Route C checklist](../phase1-route-c-release-checklist.md) records the approved three-gate design: merge; separately approved pending 0012+harmless 0013 execution; separately approved frontend publication. Lovable reportedly confirmed GitHub sync does not itself execute Drizzle migrations and frontend publication is separate. The user now reports successful execution/publication. This task did not observe the managed runner's transaction logs, production approvals, backup restore test, before/after historical-row comparisons or smoke results. Earlier “PR draft,” “NO-GO” and unknown-published-commit statements are historical checkpoints, not the current release status.

## Outstanding verification recommendations

1. Retain an operator release evidence bundle with actual ledger hash/timestamp pairs, post-migration seed/trigger checks, approval/time records, generated companion identity and historical-record preservation comparison. Do not rerun applied SQL to obtain evidence. If a fresh read-only production inspection is needed, obtain separate authorization; none is performed here.
2. Complete/retain a security scan covering dependency advisories, exposed secrets, tenancy/RLS/role permissions and signup/invitation paths. Current scan completion/results are unverified. Do not infer security from financial tests or a successful publish.
3. Under separate authorization, perform production smoke tests using disposable identities/scenarios: ordinary/invited onboarding, organization/role isolation, new sample seeding, save/reload with missing/empty/explicit F&B growth and financial equality, Year 3 EBITDA, Year 8 IRR/MOIC, maintenance FCF/project IRR and grown benchmark fares. Record exact live revision/deployment and approved test IDs. Never edit historical assumptions to test or normalize them.
4. Preserve backup availability and separately verify a restore/recovery procedure in an isolated environment. User's prior preflight backup was 22 October 2026 at 05:00:18 UTC; present retention/restorability is not checked here.

**Release status:** Phase 1 is reported merged, migrated and published, and its source-level Node 24 financial baseline is independently reproduced. Operational/security acceptance evidence remains limited to what has been supplied. This documentation does not declare unobserved production checks passed.
