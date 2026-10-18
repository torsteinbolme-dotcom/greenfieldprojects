# Tasks
- [x] Add expandable total revenue and total OPEX rows that show or hide their individual items; verify both controls.
- [x] Show all four operating expense categories and total OPEX in the forecast; verify reconciliation and the signed-in display.
- [x] Verify displayed base white (#F2F2F2) and blue (#14314D): browser measurements confirm page/panel backgrounds and sidebar use the exact requested colours.
- [x] Format all numbers with spaced thousands, decimal commas and no more than two decimals, including editable fields and graphs.
- [x] Limit side-by-side comparisons to 15 years and add an EBITDA graph below the first graph.
- [x] Apply Outfit and the selected blue, white and supplemental colours throughout the site.
- [x] Test the comparison horizon and verify graphs and styling in the signed-in app.
- [x] Automatically save scenario assumptions, project details and organization name; provide undo for edits.
- [x] Verify automatic saving, undo, version isolation and editing during saves with tests and signed-in checks.
- [x] Link child, one-way, annual pass, cruise and tour fares to adult round-trip pricing across editing, saving and forecasts.
- [x] Add an editable percentage-of-adult-round-trip column and preserve each percentage in scenario versions.
- [x] Remove the Boardings / guest column from passenger segments.
- [x] Test fare rules and verify changing and saving prices in the signed-in app.
- [x] Remove the variable cost per passenger and maintenance capex inputs from the operating costs card; verify the Revenue tab.
- [x] Display years without a thousands separator; verify the opening year displays, edits and saves as 2030.
- [x] Take variable cost per passenger and maintenance capex out of the calculation itself; verify results and add an engine test.
- [x] Default the model horizon to 15 years everywhere (new projects, example, new-account sample) and set the open project's Base scenario to 15; verify it saves and reloads.

## Open
- [x] Tax-loss carryforward in the model (engine change, tested).
- [x] Passengers-per-segment column in segment table (verified in preview).
- [x] Move the whole Returns block to the top of the comparison page and put MOIC second in the table.
- [x] Make comparison table columns sortable, sorted by MOIC by default; verified clicking re-sorts and reverses in the signed-in preview.
- [x] Comparison table: Exit cell shows only the sale multiple, with the exit year in its own column immediately after Exit; verified in the signed-in preview.
- [x] Returns bar chart displays MOIC instead of IRR; verified axis in x units and bar heights in the signed-in preview.

## Benchmarks (brief: Improve_the_existing_Greenfield_Projects)
- [x] Phase 1: benchmark database (assets + yearly records, NOK, status, source, notes), 2025 data from the uploaded workbook, Excel import, manual edit, history kept per year.
- [x] Phase 1: dashboard with Cable cars / Restaurants / Combined tabs, sortable tables, charts, history chart.
- [x] Phase 2: Benchmarking tab in each project (comparable selection, weights summing to 100%, calendar vs stabilised years).
- [x] Phase 3: Apply Benchmark Assumptions (preview + confirm, undoable) and deviation flags with configurable threshold. Engine OPEX split declined by user (2026-10-18).
- [ ] New accounts don't get the 2025 benchmark seed yet.
- [x] Comparison split into Project vs. Project and Year 3 vs. Benchmarks with expandable sidebar menu; verified signed in.
- [x] Display differences with an explicit sign and colour them: + green, - red, zero and missing neutral; verified in the signed-in preview.
- [x] Use Benchmark as Project Basis (project tab + Year 3 comparison)
- [x] F&B revenue/OPEX "Use Benchmark" selectors with passenger adjustment
- [x] F&B following annual passengers in every year
- [x] F&B benchmarks scaled to year-3 passengers (year 1 back-computed so year 3 lands on the scaled amount)
- [x] Default the Benchmarking comparison to operating year 3 (stabilised), matching Year 3 everywhere; verified in the signed-in preview.
