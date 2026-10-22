# Financial Engine v1.0 — implemented baseline specification

Baseline source: [`c18d1444998c58619e76e9e7fcbf7cb5e7d6b90f`](https://github.com/torsteinbolme-dotcom/greenfieldprojects/commit/c18d1444998c58619e76e9e7fcbf7cb5e7d6b90f). Prepared 22 October 2026. This describes inspected implementation, not a proposed financial model. No formula, assumption, fixture or persisted version identifier is changed by this documentation.

**v1.0 is the release/specification label.** The actual saved calculation tag remains `mountain-v5-volume` (`src/lib/model.ts`). That tag is metadata, not a dispatcher that loads old calculation implementations. Historical assumptions are recalculated by the current code. Source commit, lockfile, runtime and fixture identities are therefore essential provenance.

All source paths below are repository-relative. The test references are in `src/test/`. See [dependency map](dependency-map.md), [testing](testing.md), [release record](phase1-release-record.md) and [safeguards](safeguards.md).

## 1. Contract, units and entry points

| Component                                            | Required inputs                                          | Outputs and dependencies                                                                                                                        | Validation and tests                                                                                                                                                                                                                     |
| ---------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `safeCalculate` in `src/lib/model.ts`                | Saved `Assumptions`, including optional extension JSON   | `withLinkedTicketPrices` → `resolveAssumptions` → `calculate`; returns `{result,error}` with one side null; catches exceptions. No persistence. | No saved-input mutation; `advanced-foundation.test.ts`, `phase1-compatibility.test.ts`, `ticket-pricing.test.ts`.                                                                                                                        |
| `calculate` in `src/financialEngine.ts`              | Resolved assumptions defined by its exported type        | Initial CAPEX/debt/equity, weighted fare, full annual rows, exit EV/equity, equity IRR/MOIC, equity cash-flow array                             | Calls `validateFinancialInputs`, `validateVolumeMethods`, horizon/mix guards and finite-output guards. Direct callers must resolve optional modules and linked fares themselves. `financialEngine.test.ts`, `phase1-validation.test.ts`. |
| `projectReturns` in `src/lib/year3.ts`               | Matching assumptions and engine result                   | Separate unlevered FCF, project IRR, payback and project cash-flow array                                                                        | Derives from engine rows; does not perform full input validation again. `year3.test.ts`, `phase1-financial-integrity.test.ts`.                                                                                                           |
| `irrAtYear` / `moicAtYear` in `src/lib/portfolio.ts` | Matching assumptions/result and optional year, default 8 | Hypothetical exit returns at selected operating year, independent of saved exit year                                                            | Missing year returns null; MOIC requires positive invested equity. `comparison.test.ts`, `phase1-financial-integrity.test.ts`.                                                                                                           |

Amounts are NOK, rates decimals, passenger counts annual guests (fractional forecasts are permitted). There is no automatic currency conversion. Year 1 is the opening calendar year, and `calendarYear = openingYear + year − 1`. Forecasts are annual, with no partial opening year. Year 3 means `rows[2]`. Standard headers compare Year 8 returns even if the saved engine exit is elsewhere. `performanceYear` controls a presentation selection (rounded/clamped by `performanceYearOf`), not the return horizon.

Arithmetic uses JavaScript binary 64 numbers, including deliberate operation order; display rounding is not accounting rounding. Ticket linking already uses 12 significant digits as described below. No monthly financing or dated XIRR is implemented.

## 2. Growth conventions

For an annual growth list `g`, Year 1 index is 1. In year `t ≥ 2`, use `g[min(t−2, g.length−1)] ?? 0`. The final value repeats indefinitely; an empty list contributes zero. Passenger and flat-ticket amounts recur by multiplying the prior amount. `escalation` and `ticketPriceGrowthIndex` build cumulative products. Cost growth uses each of `opexGrowth.cable/fb/merch` if nonempty; otherwise `costIndex = (1 + costInflation)^(t−1)` using `Math.pow`. These mathematically similar paths are not guaranteed bit-identical across runtimes.

Required input families: `passengerGrowth`, `priceGrowth`, `ancillaryGrowth`, `costInflation` and optional cost lists. Outputs: annual passengers, prices, ancillary indices and OPEX/maintenance indices. Dependencies: active revenue/cost methods and advanced overrides determine which lists actually control results. Active growth entries must be finite and ≥ −1. Advanced Operations' own inflation must be finite and strictly > −1. Tests: `opex-growth.test.ts`, `growth-list.test.tsx`, `phase1-compatibility.test.ts`, `advanced-operations.test.ts`.

## 3. CAPEX and financing

Source: `src/financialEngine.ts`, `src/lib/financial-validation.ts`; detailed override in `src/lib/advanced-capex.ts`.

- `baseCapex = Σ(quantity × unitCost)` in entered order.
- `capex = baseCapex × (1 + contingencyRate)`.
- `debt = capex × debtShare`; `equity = capex − debt`.
- Initial investment and funding occur at time zero. The standard 60% debt / 40% equity split is a creation/template assumption, not a mandatory engine rule.

Inputs: CAPEX lines, contingency, debt share. Outputs: initial investment/debt/equity, depreciation basis, maintenance basis and starting cash flows. Both quantity and unit cost may be signed to support credits/rebates. Each must be finite; net base and total investment must be finite/nonnegative. Zero investment is permitted. Contingency is finite/nonnegative without a 100% ceiling; debt share is 0–1. No automatic correction or normalization of entered lines.

Tests: `phase1-compatibility.test.ts` (credits, negative net rejection, zero investment), `financialEngine.test.ts`, `phase1-validation.test.ts`, `advanced-capex.test.ts`.

## 4. Passengers, segments and ticket income

Source: `src/financialEngine.ts`, `src/lib/ticket-pricing.ts`, `src/lib/seasonal-pricing.ts`.

`P1 = initialPassengers`; `Pt = P(t−1) × (1 + passengerGrowth[t])` under the list convention. Segment shares stay constant; Advanced Demand changes aggregate passengers, not segment mix. No capacity ceiling is imposed on revenue. `boardingsPerGuest` is not multiplied into ticket income.

For each segment, `net fare = grossPrice / (1 + vatRate) × (1 − commission)`; flat weighted Year 1 fare is the sum of share × net fare. `ticketRevenue[t] = Pt × ticketNetPrice[t]`. Commission is applied after removing VAT; cruise/tour commissions use the same segment formula. There is no separate commission expense or VAT cash settlement in the cash-flow model.

Before calculation and saving, `withLinkedTicketPrices` recognizes the adult round-trip base fare. Other segments use saved `roundTripAdultRatio`, else standard name-based ratios, else the current custom-fare/base-fare ratio (zero if base is zero). Linked gross fare is `Number((adultFare × ratio).toPrecision(12))`. Name-based starting ratios: child round trip .5; adult one way and MICE .6; child one way .3; adult annual pass 4; cruise and tour operators 1. These are implemented fallback conventions; explicit saved ratios take precedence. Without an adult round-trip segment, no linking occurs. This existing transformation means persistence is not a byte-for-byte passthrough of every fare input; it is shared with calculation.

Seasonal pricing, when enabled, uses the same segment shares, VAT and commission, weighted by the 12-month passenger allocation and high/low season assignments. Child/one-way seasonal fares link to the seasonal adult base. Other seasonal fare locks are UI behavior. Equal seasonal/flat fares deliberately retain the legacy flat calculation path. Otherwise seasonal weighted Year 1 fare is multiplied by the ticket-price growth index. F&B linking retains the **flat** ticket-growth basis; seasonal fare changes do not independently inflate F&B.

Inputs: passengers, growth, segment names/shares/prices/VAT/commission, optional ratios, seasonal prices/months and capacity monthly allocation. Outputs: passengers, `weightedTicket` (Year 1), annual `ticketNetPrice` and ticket income. Validation: initial passengers finite/nonnegative; segment shares and commission 0–1; shares sum within 1e−6; prices/VAT finite/nonnegative (VAT has no 100% ceiling). Seasonal prices must match names/order, be finite/nonnegative, and contain 12 valid seasons with valid allocations (12 entries 0–1 summing within 1e−8). Tests: `ticket-pricing.test.ts`, `seasonal-pricing.test.ts`, `seasonal-net-price.test.ts`, `seasonal-fare-links.test.ts`, `phase1-financial-integrity.test.ts`, `phase1-validation.test.ts`.

## 5. F&B, merchandise and ancillary revenue

Source: `src/financialEngine.ts`, `src/lib/volume-methods.ts`, `src/lib/fb-benchmark.ts`.

Let `A[t]` be the ancillary growth index, `V[t] = Pt/P1` if P 1>0 else 0, and `Q[t]` be current flat fare / Year 1 flat fare if the latter>0 else 1.

Legacy F&B starts at `fbRevenueYear 1` and compounds ancillary growth, unless passenger linking is selected. Linking is controlled independently per benchmark revenue source (`source.adjust ?? fbBenchmark.adjust`), else by `fbFollowsPassengers`. Linked F&B is `fbRevenueYear 1 × V[t] × Q[t]`. Legacy merchandise starts at `merchRevenueYear 1` and compounds ancillary growth. Legacy “other” revenue is zero.

Explicit revenue methods independently replace each category's revenue:

| Method                 | Implemented amount                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| `annual`               | `annualAmount × A[t]`                                                                            |
| `perPassenger`         | `Pt × perPassenger × A[t]`                                                                       |
| `benchmark` (F&B only) | Frozen benchmark Year 1 amount × (`V[t]×Q[t]` if linked, otherwise `A[t]`)                       |
| `perPassengerSeries`   | `Pt × perPassengerByYear[min(t−1,last)]`, empty/missing value → 0; no extra ancillary escalation |
| absent / `legacy`      | Legacy formula above                                                                             |

Frozen benchmark Year 1 amount = `historicalAmount × (initialPassengers / benchmarkPassengers if adjusted, else 1) × (1 + manualAdjustment)`. Absent snapshots or invalid/missing positive benchmark passenger basis when adjustment is requested fall back to the saved manual Year 1 amount. Calculation does not fetch live benchmarks.

`perPassengerSeries` is produced by Advanced Commercial for F&B/merchandise. Although the broad volume type also permits it for `other`, the engine's `otherRevenue` call omits the year argument and therefore uses the first series entry every year. Treat a varying-year “other” series as an unsupported/known edge requiring a separately reviewed correction; do not claim it is a working advanced module. It is unchanged here.

Required inputs/outputs: active method amounts, passengers, growth, selected frozen snapshot/flags → category revenue and total revenue. Explicit finite/nonnegative amounts are validated; benchmark method is rejected outside F&B. Inactive manual fields are preserved and normally ignored, except when they still provide a legacy OPEX ratio denominator. Tests: `volume-methods.test.ts`, `stage1-fb.test.ts`, `fb-benchmark.test.ts`, `phase1-compatibility.test.ts`, `advanced-commercial.test.ts`.

## 6. Operating expenses

Cable costs: `(cableFixedOpex + cableVariableCostPerPassenger × Pt) × cableCostIndex[t]`, unless Advanced Operations replaces the whole cable block. Passenger growth affects the variable component only; cost growth applies to both. Inputs and selected cost assumptions must be finite/nonnegative. Inactive standard costs do not invalidate Advanced Operations.

Legacy F&B OPEX base is selected in this priority order, then multiplied by the F&B cost index:

1. Nonempty explicit F&B OPEX growth list: `fbOpexYear 1` only, with no extra passenger/revenue scaling.
2. Benchmark OPEX source present: `fbOpexYear 1 × (V[t] if its adjust flag is true, else 1)`.
3. Passenger-following legacy F&B: `fbOpexYear 1 × V[t]`.
4. Otherwise, positive `fbRevenueYear 1`: `fbOpexYear 1 × actualFbRevenue[t] / fbRevenueYear 1`.
5. Zero/nonpositive manual revenue basis: fixed `fbOpexYear 1`.

Legacy merchandise OPEX: if `merchOpexRate != null`, `actualMerchRevenue × merchOpexRate` with no extra cost inflation. Otherwise `(merchOpexYear 1 × actualMerchRevenue / merchRevenueYear 1 if the denominator>0, else merchOpexYear 1) × merchandiseCostIndex`.

Explicit OPEX methods:

| Method                 | Implemented amount                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| `annual`               | `annualAmount × categoryCostIndex`                                                                          |
| `perPassenger`         | `Pt × perPassenger × categoryCostIndex`                                                                     |
| `fixedVariable`        | `(fixedAmount + Pt × variablePerPassenger) × categoryCostIndex`                                             |
| `revenuePercent`       | Corresponding actual revenue × share; no extra inflation                                                    |
| `benchmark` (F&B only) | Frozen benchmark amount × (1 if explicit nonempty F&B growth, else V[t] if linked, else 1) × F&B cost index |
| absent / `legacy`      | Legacy formula above; other legacy costs are zero                                                           |

Other explicit cost methods use `(1+costInflation)^(t−1)`, not the F&B/merchandise lists. Total OPEX adds cable, F&B, merchandise, other in that order. Row category expense fields are included when `volumeMethods` exists; otherwise presentation helpers reconstruct the legacy splits. `fbOpexAt` and `merchOpexAt` are therefore important reconciliation dependencies, not independent authoritative ledgers.

Inputs: active method amounts, revenue bases, growth, benchmark snapshot and optional operations model. Outputs: annual category OPEX, total OPEX and derived breakdowns. Nonnegative cost shares can exceed 1 (loss-making operations are legitimate); no 100% ceiling is imposed on `revenuePercent`/`merchOpexRate`. Only controlling inputs/growth are validated. A saved positive manual revenue amount can remain an active denominator even after explicit revenue selection. Tests: `opex-growth.test.ts`, `opex-defaults.test.ts`, `engine-corrections.test.ts`, `forecast-opex.test.ts`, `phase1-compatibility.test.ts`, `volume-methods.test.ts`.

## 7. EBITDA, depreciation, tax and cash-flow meanings

`revenue = tickets + actual F&B + actual merchandise + other`; `EBITDA = revenue − total OPEX`; `EBIT = EBITDA − depreciation`.

Straight-line depreciation uses initial total CAPEX / `depreciationYears`, capped at remaining book value. It stops when remaining book value is at or below `abs(capex)×1e−9`. Maintenance CAPEX is not added to this depreciation basis. Depreciation years must be finite and positive; fractional useful lives are accepted.

Engine tax is **levered**: taxable income = EBIT − interest; negative taxable income accumulates losses; subsequent positive taxable income uses available losses before `taxRate` is charged. Losses have no expiry/interest limitation in this implementation. Tax rate must be 0–1. There is no separate working-capital, deferred-tax, VAT settlement or construction cash-flow schedule.

| Meaning                         | Formula / ownership                                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Display operating cash flow     | `EBITDA − row.tax`; appears in `financialSnapshot` in `src/lib/sandbox.ts`; uses engine levered tax                         |
| Display FCF in sandbox snapshot | `EBITDA − row.tax − maintenanceCapex`; financing interest/principal excluded, but tax still levered                         |
| **Unlevered project FCF**       | `EBITDA − taxOnEBIT − maintenanceCapex` in `projectReturns`; separate loss carryforward on EBIT, with no interest deduction |
| Cash after debt                 | `EBITDA − interest − principal − row.tax − maintenanceCapex` in the annual engine row                                       |

These labels are not interchangeable under debt. The standard project IRR/FCF helper uses the consistent unlevered definition corrected in Phase 1. The sandbox's snapshot FCF remains a distinct levered-tax diagnostic; adopting a single named cash-flow contract is a recommendation, not a change in this baseline.

Maintenance investing outflow = `initial total CAPEX × maintenanceCapexPct × cableCostIndex[t]`. Missing/zero percentage → 0. Legacy `maintenanceCapexRate` remains inert. The active percentage must be finite/nonnegative and has no 100% cap. Maintenance reduces cash, never EBITDA. Advanced Operations' own inflation does not replace this cable cost index.

Outputs/dependencies: annual EBITDA/EBIT/tax/maintenance; presentation operating CF; project FCF array. Tests: `engine-corrections.test.ts`, `production-financial.test.ts`, `year3.test.ts`, `phase1-financial-integrity.test.ts`, `sandbox-metrics.test.ts`, `final-financial-validation.test.ts`.

## 8. Debt, funding shortfalls and shareholder cash flows

`openingDebt[1] = initial debt`; interest = opening debt × annual interest rate. Principal = `min(openingDebt, initialDebt / loanYears)` while operating year ≤ tenor, otherwise 0. Closing debt = `max(0, openingDebt − principal)` and becomes next opening debt. Equal principal amortization; no annuity, refinancing, drawdown phasing, grace period or interest capitalization. Outstanding debt can remain at exit if tenor exceeds holding period/horizon.

Loan tenor must be a positive integer even if debt share is zero; it need not fit the forecast horizon. Interest must be finite; a negative interest rate is currently allowed. Tests protect fractional/zero/negative/nonfinite tenor rejection. DSCR = `(EBITDA − row.tax)/(interest + principal)` when debt service>0, else null; this definition excludes maintenance CAPEX and is not a covenant-grade cash-available-for-debt-service definition.

Distribution = `max(0,cashAfterDebt)` if `distributeCashAnnually`, otherwise 0. Retained cash adds cash after debt less distribution. If that balance is negative, shareholders inject exactly enough to bring it to zero. Shortfalls can consume prior retained cash first. The engine does not borrow automatically to cover losses.

Outputs: annual debt schedule, cash after debt, distribution, retained cash, injection, DSCR. Dependencies: CAPEX/debt inputs, operating cash/tax/maintenance and distribution flag. Tests: `financialEngine.test.ts`, `engine-corrections.test.ts`, `phase1-financial-integrity.test.ts`, `phase1-validation.test.ts`.

## 9. Exit, equity IRR/MOIC and unlevered project IRR

At saved exit year: `EV = exit EBITDA × exitMultiple`. `exitEquityValue = EV − closingDebt + retainedCash − EV × exitTransactionCostRate`. Negative EV/equity proceeds are not floored. Exit multiple finite/nonnegative; transaction cost rate 0–1. No sale tax or separate balance-sheet asset adjustments are modeled.

Equity cash flows: time zero `−initial equity`; each held year's `distribution − equityInjection`; add exit equity value in the exit year. `totalEquityInvested = initial equity + injections through exit`. `MOIC = (distributions through exit + exit equity value)/totalEquityInvested`, null if denominator≤0. Retained cash is realized once at exit; distributions are not also retained. Full annual rows continue through the forecast horizon, but engine returns stop at saved exit.

Year 8 helper returns apply the same exit math to row 8, sum funding/distributions through 8 and leave saved assumptions/engine exit unchanged. Portfolio averages are arithmetic means of available project metrics, **not pooled portfolio IRR or capital-weighted MOIC**. Comparison display years cap at 15 without truncating engine forecasts.

Project return flows: `[-capex, FCF1, …, FCFexit + EV×(1−transactionCostRate)]`. No debt deduction or retained-cash addition in this unlevered terminal value, because annual project FCF already counts operating cash. Project payback interpolates the first crossing of cumulative initial investment plus project FCF, using all forecast years and **excluding exit proceeds**; null if not reached. This can extend beyond the chosen exit year.

`irr` discounts regular annual cash flows via `xnpv = Σ CF[i]/(1+r)^i`; the name `xnpv` does not imply dated XIRR. It requires positive and negative cash flows, brackets from −.9999 to 1 (up to 30 upper-bound expansions), then bisects up to 200 iterations, stopping at absolute NPV residual<1e−7. Returns null when sign/bracket conditions fail. It does not enumerate multiple roots; mixed-sign sequences or extreme magnitudes require interpretation. Finite result guards cover forecast values; this is not a comprehensive theorem of IRR uniqueness or numeric conditioning.

Tests: `financialEngine.test.ts`, `comparison.test.ts`, `year3.test.ts`, `phase1-financial-integrity.test.ts`, `production-financial.test.ts`, `phase1-compatibility.test.ts`. Independent reference: 100 passengers × NOK 3 ticket, OPEX 100, CAPEX 1000, debt 600/equity 400, maintenance 20, depreciation 100 and tax 20% → EBITDA 200, unlevered FCF 160, project IRR 16%, exit debt 120, retained cash 550.4, exit equity 1430.4, MOIC 3.576, Year 8 equity IRR `3.576^(1/8)−1`. See the unchanged literal test fixture, not a regenerated expected result.

## 10. Benchmark integrations and comparisons

| Path                                         | Inputs → behavior/outputs                                                                                                                                                                                                                                         | Validation / relevant tests                                                                                                                                                                                                                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/benchmarks.ts`                      | Reported asset/year/status revenue, OPEX, EBITDA and passengers; EBITDA falls back to revenue−OPEX if missing. Restaurant per-passenger metrics use same-year parent cable-car passengers. Combined totals subtract explicitly supplied intercompany adjustments. | Missing/zero denominators → null. No automatic currency conversion or blanket comparability guarantee. `benchmarks.test.ts`.                                                                                                                                                |
| `src/lib/project-benchmarks.ts`              | Project config selects assets/weights/year. Weighted means renormalize over finite available positive-weight values; actual preferred. `projectMetrics.cableRevenuePerPax` reads **the forecast row's ticketNetPrice**, including growth/seasonality.             | Weight sum tolerance 1e−6. Missing metrics remain null. Cable revenue/margin grouping includes merchandise, while this ticket-price metric is ticket-only; it is a different grouping from `splitYear`. `project-benchmarks.test.ts`, `phase1-financial-integrity.test.ts`. |
| `src/lib/year3.ts`, `src/lib/year3-bench.ts` | `splitYear` separates ticket/cable, F&B, merchandise+other; parts reconcile with totals. Percentiles are individual asset ratios, linearly interpolated, not pooled ratios. Selected actual/budget status is exact, without silent status fallback.               | Monetary/per-passenger values can be normalized by `(1+rate)^(targetYear−sourceYear)`; passenger counts and margins are not inflated. `year3.test.ts`, `comparison.test.ts`.                                                                                                |
| F&B frozen snapshots                         | `withFbBenchmark` freezes/derives legacy Year 1 amounts in the UI adapter; explicit methods read frozen snapshots in the engine and retain inactive manual amounts. Refresh is an explicit UI action.                                                             | Snapshot provenance/parent-passenger warnings; no live benchmark fetch during engine calculation. `fb-benchmark.test.ts`, `stage1-fb.test.ts`, `volume-methods.test.ts`.                                                                                                    |
| `src/lib/cable-opex-benchmark.ts`            | Latest usable **NOK** record (actual preferred within year), optional ratio to Year 1 passengers; apply as fixed annual cable cost, variable cost zero; retain manual costs for deselection.                                                                      | Finite/nonnegative amount and positive source passenger basis when adjusting. Not independently invoked by `safeCalculate`; applied through input adapters. `cable-opex-benchmark.test.ts`.                                                                                 |

External actuals/budgets are comparisons or explicitly selected assumption sources. They do not automatically replace forecasts, loan rules, taxes or equity returns. Some comparison paths rely on caller currency/status filtering; the pure weighted helper is not a currency validator. Benchmark suggestions round proposed Year 1 values and only take effect through normal versioned saving. Historical year, scope, currency and treatment of merchandise/other must be aligned before interpreting deviations.

## 11. Optional advanced calculation modules

All five listed modules are implemented. `advanced` lives inside per-scenario versioned JSON. Missing settings mean OFF. Resolver order is **Demand → Detailed CAPEX → Operations → F&B Commercial → Merchandise Commercial**. Active patches write only whitelisted fields on cloned objects; final resolved assumptions omit `advanced` to avoid reapplying the same override. Disabled inputs remain saved. Turning modules off uses the standard path; exact fixture protection exists. There is no generic project-type plug-in architecture yet.

| Module / source                                         | Required inputs, calculation and outputs                                                                                                                                                                                                                                                                                                                                                     | Dependencies, guards and tests                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Demand / `advanced-demand.ts`                           | Each source annual addressable market × capture. Market/calls grow multiplicatively; capture changes by additive percentage points. Cruise call method uses calls × actual passengers/call (no extra occupancy). Finite year-specific overrides replace that year's market/capture/calls without resetting the underlying growth path. Sum source passengers, express as Year 1 plus growth. | Markets nonnegative; capture within 0–1 with 1e−12 tolerance. A positive restart after zero demand cannot be represented and throws. Legacy passenger-linked F&B Year 1 bases rescale where applicable. Aggregate demand does not map source shares into ticket segments. `advanced-demand.test.ts`, `phase1-compatibility.test.ts`.                                                                            |
| Detailed CAPEX / `advanced-capex.ts`                    | Each category `(base + contingency)×(1+escalation)^escalationYears`, contingency either % of base or amount. Resolves to category CAPEX lines and zero standard contingency.                                                                                                                                                                                                                 | Base/contingency/escalation years nonnegative; escalation finite>−1; resolved total additionally checked by core guards. Construction schedule is **informational only**, not timed IRR/debt cash flow. Valid allocation sums within 1e−6 for schedule display. Detailed categories do not support negative credit bases like standard signed lines. `advanced-capex.test.ts`.                                  |
| Operations / `advanced-operations.ts`                   | Category fixed, passenger-variable, fixed+variable or step-fixed; sum replaces whole cable OPEX block. Step cost = base + floor(metric/threshold +1e−12)×cost, capped if max steps supplied; nonpositive threshold yields zero steps. Monthly steps cost stepCost/12 per triggered month.                                                                                                    | Metrics: annual passengers, monthly passengers, operating hours. Standard cable growth unless module inflation supplied. Calendar schedule uses planned less closures floored at zero; finite days/hours bounds; monthly steps require valid allocation. Active category values only validated; inactive standard fields remain saved. `advanced-operations.test.ts`, `phase1-compatibility.test.ts`.           |
| F&B / merchandise Commercial / `advanced-commercial.ts` | Passengers × conversion × spend ex VAT. Conversion change additive, spend growth multiplicative. Seasonal option weights high/low conversion×spend by monthly allocation. Emits annual per-passenger series; engine applies actual passengers once.                                                                                                                                          | Replaces only revenue method, preserves category OPEX method. Capacity allocation/season assignments shared with existing settings. Conversion 0–1 tolerance 1e−12, nonnegative spend; explicit series/core guards reject invalid outputs. Some missing/nonfinite starter spend uses default initialization, not a strict input-schema rejection. `advanced-commercial.test.ts`, `advanced-foundation.test.ts`. |

Capacity is not purely inert metadata: it never caps passengers, but its allocation/hours feed enabled seasonal pricing, commercial calculations and step costs. Sandbox/risk/sensitivity use temporary resolved clones (`sandbox.ts`, `risk-sensitivity.ts`); break-even reruns full forecast/tax history (`break-even.ts`). No save occurs in these calculations. `applyFactors` mutates the clone supplied by its caller, not an arbitrary original assumption object. Tests: `sandbox*.test.ts`, `risk-sensitivity.test.ts`, `break-even.test.ts`, `capacity.test.ts`, `bridges.test.ts`, `presentation.test.ts`.

## 12. Persistence, validation limits and feature boundary

`src/lib/data.ts:saveAssumptionVersion` reads latest version and inserts a new row with shared linked ticket fares and `mountain-v5-volume`; unique-version collisions retry at most three attempts, other failures surface. It does not default F&B OPEX growth during saving. New project/template helpers explicitly create growth defaults; these are not backfills of old JSON. Database migration 0012 removed the save-time defaulting trigger and adapted new-user sample seeding to explicit defaults; 0013 is a harmless companion. Neither migration is changed here.

Schema membership/RLS/version constraints and scoped serial autosave protect persistence independently from pure calculation. Scenario save and audit logging are separate requests: a later audit error does not prove the scenario insert rolled back. Project/scenario creation is also not one browser-side database transaction. Mocked tests do not replace production isolation/smoke verification. Tests: `data-saving.test.ts`, `autosave.test.ts`, `recovery.test.ts`, `phase1-financial-integrity.test.ts`; historical local database rehearsal evidence is in the [release record](phase1-release-record.md).

Core horizon guard: positive integer forecast 1–40; positive integer exit≤forecast; opening calendar year integer. Validation is method-aware and preserves inactive/manual inputs; it does not normalize data. Guards cover financial finiteness, but TypeScript interfaces and local guards are **not a complete runtime JSON schema**: arbitrary malformed shapes/unknown keys, all advanced-input boundaries and every helper invocation are not exhaustively rejected at ingestion. Safe calculation catches thrown failures; additional schema contracts are recommended separately.

Not implemented as new capabilities in this baseline: working capital, dated/currency-aware XIRR, construction-finance phasing, refinancings/grace/annuity debt, separate VAT cash flows, automatic currency translation, multiple-root IRR analysis, pooled portfolio returns, a project-type plug-in system, or a versioned implementation dispatcher. Their absence is documented, not approval to add them. Known grouping/cash-flow label/other-series limitations above remain unchanged and require distinct review before any correction.
