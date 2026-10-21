# Phase 1 financial integrity — evidence and scope

Base commit: `5ca84c7042dabb18276c920d31cf193e5480e257`. Branch: `phase1/financial-integrity`.

## Before calculation changes

The existing suite initially passed all 416 tests in 47 files using pnpm-resolved dependencies. A subsequent Bun frozen-lock installation over that directory left mixed React versions and caused 19 UI failures (invalid hook dispatcher); these were environment failures, not calculation failures. The mixed dependency directory was moved out of the checkout and replaced with a clean frozen-lock installation. The final baseline and verification use the same clean locked dependencies. No manifests or lockfiles were changed.

Independent regression cases were created and run before production calculations changed. After correcting a test's floating-point comparison, both financial defects failed their expected-value assertions. Validation cases also demonstrated accepted invalid inputs. The original engine equity calculations remained correct in the independent references.

## Literal independent reference outputs (NOK)

Reference A: 100 passengers, net fare 3, annual fixed OPEX 100, initial CAPEX 1000, debt 600/equity 400, 10-year equal-principal loan at 10%, 10-year depreciation, tax 20%, maintenance CAPEX 2%, exit Year 8 at 5x EBITDA. No growth or transaction costs. End-year cash flow timing.

| Metric | Before | Correct / after target |
|---|---:|---:|
| Year 3 EBITDA | 200 | 200 (unchanged) |
| Annual unlevered tax | 20 | 20 (unchanged) |
| Annual project FCF | 180 | 160 |
| Project IRR | 18% | 16% |
| Operating payback | 5.555556 years | 6.25 years |
| Year 8 closing debt | 120 | 120 (unchanged) |
| Year 8 retained cash | 550.40 | 550.40 (unchanged) |
| Year 8 exit equity | 1430.40 | 1430.40 (unchanged) |
| Year 8 MOIC | 3.576x | 3.576x (unchanged) |
| Year 8 equity IRR | 17.26669593% | 17.26669593% (unchanged) |

Equity flows: `[-400, 0, 0, 0, 0, 0, 0, 0, 1430.40]`. Correct project flows: `[-1000, 160, 160, 160, 160, 160, 160, 160, 1160]`. Unlevered FCF is EBITDA less tax on EBIT (independent loss carryforward) less maintenance CAPEX. It excludes interest/principal; initial CAPEX is at time zero. Working capital remains absent. Exit adds enterprise value net of transaction costs, without adding retained cash a second time.

Reference B: same passenger count, gross fare 112, VAT 12%, commission 20%, annual fare growth 10%. Year 1 net fare 80; Year 3 net fare 96.80. The benchmark reported 80 before and must report 96.80 after; engine ticket revenue and EBITDA are unchanged.

Reference C: first-year ticket revenue 100 then 200, fixed OPEX 150, CAPEX 100, debt 60/equity 40, principal 6/year, no interest/tax, maintenance 2/year. Year 1 injection 58; Year 3 EBITDA 50; exit debt 12; retained cash 294; exit equity 532; total contributed equity 98; MOIC 532/98. Equity flows `[-40, -58, 0, 0, 0, 0, 0, 0, 532]` remain unchanged.

## Database reproduction

The repository's actual 0007 trigger was executed in disposable in-memory PostgreSQL (PGlite), with no production connection. Year 1 F&B revenue/OPEX 100, ancillary growth 10%, inflation 2.5%, no explicit F&B OPEX growth: the pre-save legacy Year 2 OPEX is 112.75. The trigger injects `[0.025,0.025,0.025]`, changing reload OPEX to 102.50. Correct preservation is 112.75 both before and after saving. Explicit user growth lists must stay explicit and unchanged.

Deployment status and affected production scenarios remain unknown: local configuration contains publishable credentials only; no authorized database administration connection is available. Repository presence is not deployment evidence. Read-only inspection queries, a no-backfill migration, and rollback are supplied separately. No live records have been read or modified.

## Scope and release restrictions

No interface changes, new modelling features, main-branch pushes, merges, production migrations or deployment. Existing user assumptions are not normalized/backfilled. The database preservation fix only takes effect when the separately reviewed migration is applied; it is not a claim that production is already fixed. Historical injected values are retained pending separate approval.

## Final verification

- Clean locked baseline: **416/416 tests, 47 files**.
- Before-fix new regressions: 27 failed and 6 passed (two financial defects plus validation gaps); no production calculations had changed.
- After fixes: **449/449 tests, 49 files**; no skipped tests.
- TypeScript check: passed. New TypeScript files: targeted ESLint passed after formatting. Existing calculation files were kept minimally changed rather than reformatted.
- Local application build: passed. Existing configuration emitted chunk-size and ignored `inlineDynamicImports` warnings. No deployment command was executed.
- Disposable PostgreSQL: six exact JSON **and full financial output** round trips passed; existing rows stayed unchanged; new-user template results stayed identical; migration rejected an unknown seed function; rollback restored original behaviour without rewriting saved rows. The inspection SQL was syntax/execution checked locally.
- Environment issues: initial sandbox DNS restrictions required authorized network access for clone/dependency download; first clone left an incomplete folder which was left untouched. The mixed dependency UI failures described above were resolved by a clean frozen-lock install. The local database loader initially attempted an unnecessary development WebSocket; it is disabled in the committed offline test script.

Reproduce from a clean checkout (no production connection required):

```sh
bun install --frozen-lockfile --ignore-scripts
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
```

Database regression uses isolated test tooling, without changing package.json or bun.lock:

```sh
mkdir -p /tmp/greenfield-phase1-db
pnpm --dir /tmp/greenfield-phase1-db add @electric-sql/pglite@0.5.10 --ignore-scripts
node scripts/test-phase1-db.mjs /tmp/greenfield-phase1-db/node_modules/@electric-sql/pglite/dist/index.js
```

The standalone database test is an additional check, not part of the 449 Vitest tests. Its database exists in memory and cannot take a production connection URL. `docs/phase1-test-results.json` records the compact test totals.

## Remaining risks

Production trigger state and affected scenario counts still require authorized read-only inspection. The prospective database fix and rollback are prepared for review, not applied. Previously injected F&B lists remain intact. Broader business-split/currency benchmark issues, IRR ambiguity, concurrency/transaction redesign and new financial modelling features are intentionally deferred. Sandbox cash-flow displays continue to use the existing actual-tax cash-flow convention; project comparisons use the explicitly unlevered definition above. Invalid legacy inputs now show a calculation error rather than returning an invalid forecast, and are never rewritten.
