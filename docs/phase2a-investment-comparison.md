# Phase 2A — consistent investment comparison

Implementation branch: `feature/phase2a-investment-comparison`.
Starting main: `fddc38a3a850d70949e33d021098e1957c5d2483`.
Status: draft for review; no merge, migration, publication or deployment authorized/performed.

## Result

The existing Project vs. Project route now defaults to selected scenario/version identity, the investment decision summary, and a display-only operating Years 1–10 table. Each identity includes opening year, the saved initial debt/equity split, and the saved gross adult round-trip fare including VAT. The weighted realized net fare is a distinct calculated output, never a replacement input.

`src/lib/comparison-selection.ts` retains unavailable/invalid selections and their errors. Base Case is used only when there is no explicit selection. A missing, foreign-project or malformed explicit scenario is not silently replaced. Valid entries remain available to existing Benchmark Comparison and Sandbox consumers. The shared hook propagates source-loading errors and does not change persistence.

`src/lib/comparison-projection.ts` supplies summary and annual metrics from existing financial contracts. Year 3 reads engine rows/shared unit economics. F&B/cable expenses use `forecastOpex`. Hypothetical Year 8 valuations reuse `safeCalculate` on an isolated clone with only `exitYear: 8`; when the saved exit is already 8 the existing result is reused. Year 8 IRR/MOIC use existing helpers. No terminal-value, debt, retained-cash, exit-cost or return formula is copied into the new UI. The same hypothetical sale underlies all four Year 8 outputs.

The annual selector includes passengers, net realized ticket price, total revenue, EBITDA, F&B revenue, F&B OPEX and cable-car OPEX. Calendar years accompany available values; absent years remain N/A. Initial CAPEX appears only in the investment summary; maintenance remains a distinct investing flow. Full model horizons and saved exit years remain unchanged.

Existing charts, detailed table/CSV, full-horizon development, unit-economics year selection, Sandbox and saved-exit analysis remain under Advanced. Direct Sandbox links open that section. Comparable IRR/MOIC columns and charts use hypothetical Year 8; original saved-exit returns/valuations appear separately with explicit saved-year labels. Detailed and summary CSV amounts match their million/percent headings, carry saved version identity and escape text safely.

## Validation evidence

| Check                               | Result                                                                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Before changes, pinned Node 24.19.0 | 494 / 494 passed; no failures                                                                                                     |
| Final complete pinned suite         | **536 / 536 passed** in 53 test files; no failures or skipped tests                                                               |
| Existing tests / new tests          | 494 unchanged + 42 new                                                                                                            |
| TypeScript `tsc --noEmit`           | Passed                                                                                                                            |
| ESLint on all changed TS/TSX files  | Zero errors; four retained mixed-export Fast Refresh warnings in `selection.tsx`                                                  |
| Local `vite build`                  | Passed; generated local ignored build artifacts only; no deploy command                                                           |
| Diff whitespace check               | Passed                                                                                                                            |
| Local browser fixture preview       | Summary and annual table rendered; synthetic scenarios only, Supabase disabled and external connections blocked by preview policy |

New tests cover saved exits 3/8/10 with identical hypothetical Year 8 references; unchanged input/result objects; gross adult fare and grown net fares after VAT/commission; enabled/disabled advanced modules; short horizons, zero passengers, expense reconciliation, visible failures, exact scenario/version selection, no misleading Base fallback, nondefault funding preservation, CSV scaling/labels, route-level Advanced/Sandbox behavior and exported CSV content. An initial UI test assumed a decimal-point-free percentage display; its expectation was corrected to the existing localized 60.0%/60,0% formatting. No financial tolerance or fixture was changed.

The independent Phase 1 fixture still produces Year 3 EBITDA 200, Year 8 EV 1000, equity proceeds 1430.4, MOIC 3.576 and IRR `3.576^(1/8)-1`, including when the saved exit is 3 or 10. Existing golden tests continue to pass exactly on the pinned runtime.

## Preservation and review boundaries

Financial engine/source contracts, existing test files and fixtures, financing defaults, persistence APIs, migrations/journal/schema, dependency manifest/lockfile and saved data are unchanged. The route and selection component were formatted during editing; this accounts for some diff size. Temporary preview files, screenshots and local build outputs are not application source and are excluded from the commit.

No production data or authenticated production UI was used. The screenshot is a standalone local rendering of the decision component, not proof of live authentication, organization isolation or real-data behavior. Route integration was tested in jsdom with chart geometry mocked. The local preview initially required permission to listen on localhost; it was verified and stopped. An authenticated staging/browser smoke check of live data loading, scenario navigation, responsive layout, Advanced charts and exports remains recommended before release. No production acceptance or security-scan pass is claimed.

External budget editing/importing, project-linked actual/budget variance workflows, benchmark normalization/currency cleanup and architectural refactoring remain outside Phase 2A. No new project assumptions or database structures were introduced.
