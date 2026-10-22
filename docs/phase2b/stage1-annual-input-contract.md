# Phase 2B Stage 1 — Annual financial input contract

Status: calculation-only implementation for draft review. Base: `8e76ba63dfdf171583b93f9a46f3f6f659f28389` (Phase 2A). Branch: `feature/phase2b-annual-input-contract`. No persistence, migrations, UI, deployment or production access is part of this stage.

## Public contract

`src/lib/external-budget-contract.ts` defines `FinancialInput`, discriminated by `mode`, with explicit `version: "financial-input-v1"`:

- `standard`: original `Assumptions`. `calculateFinancialInput` delegates directly to `safeCalculate` and retains its existing `{ result, error }` interface.
- `externalBudget`, `status: "complete"`: `ExternalBudgetInput`. Invalid inputs throw before returning a result.
- `externalBudget`, `status: "draft"`: `ExternalBudgetDraft`. May hold incomplete annual rows, CAPEX, confirmations or inheritance; both calculation entry points reject drafts. There is no partial financial output.

`calculateExternalBudget` returns `ExternalBudgetOutput`: the contract version and mode, the engine `result`, the shared `comparison` projection and the existing `projectReturns` derivation. No database identity is needed to reproduce these results. The ordinary scenario calculation tag remains `mountain-v5-volume`.

All money is nominal NOK; no currency conversion or present-value adjustment is applied to supplied operating figures. Rates are decimals. Passenger values follow the existing engine convention of finite nonnegative numbers; they need not be integers.

| Input | Required value | Engine mapping |
| --- | --- | --- |
| `initialCapex` | Finite, nonnegative; all-in, including contingency | Replaces investment total. Debt/equity, depreciation and maintenance use this basis. No second contingency. |
| `annual` | Exactly ten rows, explicitly numbered 1–10 in order | One continuous annual loop, not ten separate models. Duplicates, gaps, holes and unknown row fields fail. |
| `passengers` | Finite, nonnegative, explicit in each row | Replaces standard and Advanced Demand recurrence. Zero-to-positive recovery is supported. |
| `ticketNetPrice` | Realized NOK/guest, already net of VAT and commission | Ticket revenue = supplied passengers × supplied net price. No segment weighting, fare linking, seasonality or price growth. |
| `fbRevenue` | Explicit annual F&B revenue excluding VAT | Replaces all F&B revenue blocks, benchmarks and advanced commercial settings. |
| `fbOpex` | Explicit annual F&B operating cost | Replaces all F&B OPEX blocks. No passenger scaling or inflation. |
| `cableOpex` | Explicit aggregate annual cable operating cost | Replaces the entire standard/Advanced Operations cable block. No additional inflation. |
| `inheritance` | Valid snapshot version `external-inheritance-v1` | Supplies only inherited settings, never source calculated balances. |
| `accounting` | All five explicit confirmations must equal boolean `true` | Blocks incomplete or inconsistent accounting scope. |

Zero is an explicit valid input; undefined, null, strings, negatives, NaN and infinities are not amounts. Missing values are never copied from another year. Unknown inheritance fields are rejected, including calculated retained cash, debt balances, tax losses and replaced F&B settings.

## Frozen inheritance

`captureInheritance(source)` deep-clones selected source settings, validates the resulting calculation contract and recursively freezes it. Calculation reads a private clone of that snapshot. It never reloads the source scenario. Source edits or deletion therefore cannot change an existing budget. Neither source nor external input objects are mutated.

| Inherited setting | Use |
| --- | --- |
| Opening year | Calendar year = opening year + operating year − 1. |
| Debt share, interest rate, loan tenor | Recalculate initial debt/equity and the existing equal-principal schedule against external CAPEX. No inherited monetary balances. |
| Depreciation years | Existing straight-line calculation and remaining-book-value stop, including fractional useful lives. |
| `maintenanceCapexPct` | Existing external CAPEX × percentage × cable cost index. Absent percentage remains zero; the inert legacy `maintenanceCapexRate` is not activated. |
| `opexGrowth.cable`, `costInflation` | The existing cable cost index escalates maintenance. Advanced Operations' own inflation and external OPEX fluctuations do not become maintenance escalation. |
| Tax rate | Existing levered EBIT-minus-interest loss carryforward; unlevered project tax remains the separate existing `projectReturns` derivation. |
| Cash-distribution flag | Existing distribution, retained-cash and equity-injection conventions. |
| Exit multiple and transaction-cost rate | Existing Year 8 EBITDA-based enterprise value and equity proceeds. |
| Merchandise Year 1 revenue/cost, optional OPEX share, ancillary growth and merchandise cost growth | Preserve legacy methods where selected; method inputs and actual external passengers drive explicit methods. |
| Merchandise/other methods and active parameters | Recalculated using external annual passengers and their corresponding category revenue. |

Only active parameters of an explicit revenue/OPEX method are captured. Dormant source method fields remain untouched in the saved source. Year 1 legacy merchandise revenue is retained as the legacy OPEX ratio basis when the selected cost method needs it. The snapshot contains no initial investment, passenger forecast, ticket segments, F&B block, Advanced Operations schedule, source cash, tax losses, debt schedules or output rows.

Validation is method-aware. The standard validation default is unchanged. External validation ignores the replaced operating blocks, while validating inherited financial terms and controlling merchandise/other/maintenance drivers. Existing finance conventions are retained: positive integer loan tenor, debt/tax/exit-cost fractions in [0, 1], finite interest (including an existing valid negative rate), positive finite depreciation life, nonnegative maintenance percentage and exit multiple. Active growth cannot be below −100%.

### Supported inherited methods

| Category | Revenue | OPEX |
| --- | --- | --- |
| Merchandise | Legacy, annual, per-passenger, per-passenger series | Legacy, annual, per-passenger, fixed + variable, percentage of merchandise revenue |
| Other | Legacy (zero), annual, per-passenger | Legacy (zero), annual, per-passenger, fixed + variable, percentage of other revenue |

Annual and per-passenger revenue use the existing ancillary-growth index. Merchandise per-passenger series uses each resolved year's value without extra growth; existing last-value repetition applies to a shorter explicitly supplied inherited series. This is distinct from external annual rows, which must always contain all ten complete rows. Annual, per-passenger and fixed/variable costs use their existing category inflation; percentage costs follow corresponding revenue without additional inflation. Legacy merchandise costs preserve the existing ratio/fixed-zero-base/share rules.

Active Advanced Merchandise is resolved once over ten operating years from explicit commercial inputs, using the existing resolver, then frozen as per-passenger values. If seasonal merchandise is active, source season assignments and monthly weights participate in this capture; subsequent source changes cannot change the captured schedule. Replaced Advanced Demand, Detailed CAPEX, Advanced F&B and Advanced Operations are not resolved for an external budget.

Unsupported inherited methods block calculation. Benchmark methods are F&B-specific and are not available for inherited merchandise/other. Other-revenue `perPassengerSeries` is blocked: the existing engine does not pass the operating year into that particular method call, so accepting it would silently repeat its first value. Stage 1 neither fixes nor extends that standard behavior. Unknown methods, missing active parameters, nonfinite/negative selected amounts and sparse inherited lists also fail.

## Accounting boundaries

The required confirmations are:

1. `ticketAlreadyNet`: supplied ticket prices already exclude VAT and commissions.
2. `cableExcludesSeparateCosts`: cable OPEX excludes separately supplied F&B and inherited merchandise/other operating costs.
3. `opexExcludesFinancingTaxDepreciation`: operating costs exclude depreciation, interest, loan principal and tax.
4. `replacementCapexNotDoubleCounted`: replacement investments are not also included in operating costs or double-counted with model maintenance CAPEX.
5. `capexIncludesContingency`: initial CAPEX already includes contingency.

Routine maintenance labor/service OPEX may remain when distinct from replacement investment. The engine does not estimate or subtract overlaps. The confirmations express an accounting review obligation; software cannot prove the underlying budget classification. Net ticket pricing prevents a second commission/VAT deduction, but the operator must also ensure corresponding commissions have not been included again in aggregate operating costs. Merchandise/other percentage costs apply to their own category revenue, not total ticket/F&B revenue.

Working capital, new tax rules and new depreciation of annual maintenance investments are outside this contract. Existing v1.0 rules are reused exactly; no such features are implied.

## Shared calculation and output dependencies

```text
standard input → safeCalculate → linked fares / advanced resolution ─┐
                                                                  │
external complete input → validate rows + accounting                │
                       → validate frozen inheritance → adapter ────┤
                                                                  ▼
                                            financialEngine.calculate
                                 optional annual operating input selection
                                                                  │
                                 existing merchandise/other calculations
                                                                  │
                                 existing continuous financial loop
                                 depreciation → interest/principal
                                 → tax losses → maintenance → funding/cash
                                                                  │
                                     existing Year 8 exit/IRR/MOIC
                                                                  │
                      ┌───────────────────────────────────────────┴────────┐
                      ▼                                                    ▼
           comparison-projection / unit-economics                 year3.projectReturns
           authoritative aggregate expense helper                 unlevered FCF / IRR
```

The additive second engine argument is low-level plumbing; application integrations should use the versioned facade and frozen inheritance, not pass a raw linked scenario as annual-mode engine assumptions. The internal adapter uses neutral placeholders for replaced fields and fixes horizon = 10, exit = 8. It does not approximate external annual figures using growth rates or synthesize gross fares.

`YearResult.externalOperatingCosts` exists only on external rows and carries cable total, F&B, merchandise and other costs. `forecastExpenseBreakdown` returns an authoritative `cableTotal`, with `cableFixed: null` and `cableVariable: null` for external rows. Standard rows retain their original split and numbers. `unitEconomics` and `projectComparison` use this aggregate-safe helper. Legacy `forecastOpex` retains its standard return interface and explicitly rejects external rows so callers cannot accidentally show a fabricated split; future external integrations must use the new helper.

Year 3 metrics reuse shared engine-backed comparison derivations. External projections never recalculate the source scenario at Year 8. They use external engine returns directly, even if the linked scenario has a different saved exit year or has subsequently changed. Gross adult fare is unavailable for an external budget; the realized net fare is authoritative.

Year 8 enterprise/equity values, IRR and MOIC use the budget's own initial debt/equity, operating history, additional injections, distributions, closing debt and retained cash. Equity cash flows have Year 0 plus Years 1–8 only. Rows 9–10 remain continuous counterfactual operating forecasts; any distributions shown in those rows are not added to Year 8 shareholder proceeds. Project FCF is EBITDA less existing unlevered tax and maintenance CAPEX. Project exit proceeds use EV net of transaction costs, excluding debt and retained cash; the existing helper calculates project IRR.

## Independent reference evidence

`src/test/external-budget.test.ts` uses independent literal NOK cases, not only engine-to-engine comparisons.

| Reference | Year 3 / Year 8 outcome |
| --- | --- |
| CAPEX 1,000; debt 60%; interest 10%; tenor 10; revenue 300; OPEX 100; maintenance 20; depreciation 100; tax 20%; exit multiple 5 | Y3 revenue 300, EBITDA 200; Y8 debt 120, retained cash 550.4; EV 1,000; equity exit 1,430.4; MOIC 3.576; equity IRR `3.576^(1/8) − 1`. |
| Same reference, unlevered | FCF 160 each year; Year 8 project exit cash flow 1,160; project IRR 16%. |
| CAPEX 100; debt 60; three-year principal; two-year depreciation; maintenance 2; tax 25%; EBITDA −50, 50, 150, then 50; exit costs 10% | Injection 78 in Y1; tax 0, 0, 9.5, then 12.5; Y8 retained cash 318, EV 250, equity exit 543; total equity 118; equity IRR about 23.0374624%. |
| Same loss case, unlevered | FCF −52, 48, 135.5, then 35.5; project IRR about 33.8105831%. |

Additional coverage includes exact nominal inputs and zero-to-positive passengers, CAPEX applied once, all supported inherited method families, Advanced Merchandise, maintenance escalation independent of external OPEX, fractional depreciation, annual distributions, later-year return isolation, unavailable expense splits, zero investment, input immutability, source independence, drafts, invalid/missing inputs, unsupported methods and standard facade compatibility.

## Verification and change impact

Tests run with the repository's pinned Node **24.19.0** baseline runner. Initial baseline: **536/536 passed**, no skipped tests. Final results are recorded below after verification. Golden fixtures, calculation tags, example assumptions, financing defaults and saved data are unchanged.

The default ESLint command finds existing compact-engine formatting and `@ts-nocheck` violations, plus existing unit-economics formatting violations. New files receive full default lint. Changed existing files receive semantic lint with only these two existing rules disabled; a baseline/current rule-count comparison is performed to ensure no added violations. No lint rules or configuration are changed in the repository. The compact authoritative engine is not reformatted wholesale.

The local Vite production build generates ignored build and Wrangler configuration artifacts; building is not publishing. No deploy command is run.

No UI calls the new external contract yet. Existing saved assumptions and financial outputs are protected by the unchanged 536-test suite, including exact golden serialization checks. Standard scenario financing/tax/depreciation/cash/exit operation order is preserved. Changes are limited to input selection, method-aware external validation, aggregate expense output, shared projections, tests and this document.

## Future-stage boundaries and review gates

The financial DTO is not a persistence API or ordinary scenario JSON. Future stages must place budget identity, organization/project ownership, source provenance and pinned source version in a separately reviewed persistence contract. Dedicated budget/version tables remain the approved direction; no table or SQL is created here. Older Greenfields clients must never read these budgets as ordinary scenarios.

Future policies to preserve:

- Snapshots are immutable; explicit refresh captures a new snapshot in a new budget version.
- Deleting or changing a source scenario must not invalidate an existing frozen budget.
- Duplication is restricted to the same project, with a new identity/version and unchanged snapshot unless explicitly refreshed.
- Incomplete drafts can be saved later, but cannot calculate.
- Unsupported inherited methods block calculation.
- Archival replaces ordinary-user permanent deletion.

These ownership/versioning/archive policies require later server/database enforcement; Stage 1 implements no authorization, persistence, deletion or duplication operation. Do not interpret the pure calculation module as a security boundary.

Review gates: (1) approve this calculation contract and regression evidence; (2) separately review schema, RLS, append-only version/provenance design and migration/rollback plan; (3) separately review UI and authenticated organization-boundary acceptance in an isolated environment; (4) separately approve any merge, database execution and publication. No Stage 2 work begins automatically.

Remaining limitations: accounting confirmations cannot verify source-book classifications; unsupported other-revenue series remains blocked; no authenticated staging environment is available, so no external-budget persistence/UI/security smoke test is claimed. Existing general IRR/root-selection and financial-engine conventions are preserved rather than expanded.

### Recorded verification — 2026-10-22

| Check | Result |
| --- | --- |
| Pre-edit baseline, Node 24.19.0 | 536 passed; 0 failed; 0 skipped. |
| Final full suite, Node 24.19.0 | 612 passed; 0 failed; 0 skipped; 54 test files. Includes all original tests and 76 new cases. |
| TypeScript `tsc --noEmit` | Passed. |
| Default lint on new contract, facade, tests and modified validation/expense/comparison helpers | Passed. |
| Semantic lint on all changed existing TypeScript files (only pre-existing formatting / ban-ts-comment rules excluded) | Passed. |
| Default lint baseline/current comparison | Engine: 95 formatting + 1 existing `@ts-nocheck` violation both before/after; unit economics: 18 formatting violations both before/after; forecast helper: 2 formatting violations before, 0 after. No new violations. |
| Local Vite production build | Passed; no publish/deploy operation. |
| Scope review | No existing fixture/test edits; no migrations, schema, data, UI, calculation-tag or dependency changes. |

Reproduction with Node 24.19.0 on PATH:

```sh
node scripts/test-financial-baseline.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src/lib/external-budget-contract.ts src/lib/financial-input.ts src/lib/financial-validation.ts src/lib/forecast-opex.ts src/lib/comparison-projection.ts src/test/external-budget.test.ts
node node_modules/eslint/bin/eslint.js src/financialEngine.ts src/lib/unit-economics.ts --rule 'prettier/prettier: off' --rule '@typescript-eslint/ban-ts-comment: off'
node node_modules/vite/bin/vite.js build
```

These are local verification results, not GitHub CI or authenticated staging acceptance. No isolated staging environment was available. No permission beyond the approved development branch and draft PR was used.

## Acceptance-blocker corrections

The independent review of `dd15aacc9937651eadcdd17d95e410a473a4fddc` found two runtime-validation gaps despite its passing 612-test suite. The following corrections are confined to external inheritance validation and directly related regression tests. The earlier verification record above remains the historical evidence for that reviewed commit.

### Required merchandise basis

The engine uses `merchRevenueYear1` both as legacy revenue and as the denominator/branch selector for legacy merchandise OPEX without a revenue-share override. Previously, an omitted basis could select fixed costs instead of the intended revenue ratio. Validation now checks that basis before calculation when the active methods need it:

| Active merchandise revenue | Active merchandise OPEX | Legacy revenue basis required? |
| --- | --- | --- |
| Legacy/absent selector | Any | Yes: revenue itself consumes it. |
| Explicit method | Legacy/absent selector, no `merchOpexRate` | Yes: preserve the explicit ratio-versus-fixed basis. |
| Explicit method | Legacy with a valid `merchOpexRate`, including zero | No: costs use the corresponding actual revenue share. |
| Explicit method | Explicit annual/per-passenger/fixed-variable/revenue-percent method | No: the legacy basis is inactive. |

A required basis must be explicitly finite and nonnegative. Missing, null, string and nonfinite values are rejected. An explicitly supplied zero remains valid and retains the existing fixed-cost fallback. No zero is substituted, no source assumption is rewritten and no financial calculation method changes.

Independent reference: external CAPEX 1,000; standard reference financing; merchandise annual revenue 40; legacy merchandise OPEX 10; legacy revenue basis 20. The complete snapshot retains Year 3 revenue 340, merchandise OPEX 20, EBITDA 220, Year 8 exit equity 1,658.4 and MOIC 4.146. Removing the basis previously produced OPEX 10, EBITDA 230, exit equity 1,772.4 and MOIC 4.431; that incomplete input now throws before returning any results. Explicitly choosing a zero basis still legitimately produces those fixed-cost results.

### Strict inherited selectors

Only an absent selector or explicit `"legacy"` selects legacy behavior. An explicitly empty string no longer follows the falsy-value legacy branch. Empty/unknown/whitespace strings, null, booleans, numbers, arrays and objects are rejected on every inherited merchandise/other revenue/OPEX side. Supported explicit methods and parameters retain their existing rules. Standard scenario validation is unchanged.

### Corrective verification

- New regression tests reproduced both acceptance failures before the guard changes.
- Complete pinned Node **24.19.0** suite: **636/636 passed**, no failed or skipped tests, 54 test files: original 536 + original Stage 1 76 + 24 corrective cases.
- All 59 pre-existing test/fixture files from main remain byte-identical; all original 536 cases are present and passing. The original Stage 1 tests remain unchanged; corrective cases are appended. No golden fixture or tolerance was changed.
- Repeated **110** standard-engine and comparison-projection cases against main: exact object and serialized numerical equality.
- Compared **51** valid external-budget outputs against the reviewed PR commit: exact equality, including the complete merchandise-ratio example.
- Explicit probes confirm the missing required basis and empty selector both throw. Zero basis, absent/legacy selectors and methods with an unused basis remain accepted.
- TypeScript, default lint on both changed TypeScript files and the local Vite production build passed. The historical engine/style lint limitations are unchanged; no lint configuration was modified.
- Incremental files: `src/lib/external-budget-contract.ts`, `src/test/external-budget.test.ts`, and this document only. Financial engine formulas, standard validation, funding defaults, input/output type definitions, persistence contracts, migration files, UI and dependencies are unchanged.

Recommendation after these corrections: **GO for a reviewed Stage 1 calculation-only merge**, subject to final review of the new commit. This is not authorization to merge or release. Accounting classifications still require human review, other-revenue per-passenger series remains blocked, and no authenticated staging, persistence or RLS acceptance is claimed. PR #4 remains draft; no production, migration, publication or deployment operation was performed.
