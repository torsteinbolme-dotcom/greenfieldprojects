<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- `src/financialEngine.ts` and `src/exampleProject.ts` are the user's authoritative files, kept verbatim; never change formulas without asking the user first. Why: these are the investment calculations the user signed off on.
- All outputs are computed client-side from stored inputs (`scenario_assumptions` JSONB, append-only versions); never store outputs edited by hand. Why: results stay deterministic and every version can be audited.
- Every table has `organization_id`; RLS uses `is_org_member` / `can_edit_org` / `is_org_admin` (security definer). Why: one organization must never see another's data.
- Saving a scenario inserts a new version row; the Base scenario is a separate row, so edits elsewhere never overwrite it. Why: scenario isolation and version history.
- New signups get their own organization plus a seeded Project Mountain (`handle_new_user` trigger). Why: every account starts with a working example.
- Ticket percentages are optional segment inputs stored in scenario JSON and applied through `src/lib/ticket-pricing.ts` before editing, calculating and saving; keep the authoritative engine and example unchanged. Why: user-editable fare relationships persist per version without rewriting historical inputs or engine formulas.
- Use the scoped serial autosave controller for editable assumptions and text details; undo creates a new saved snapshot and never deletes version history. Why: edits during requests must survive and scenario histories stay isolated.
- Comparison display years are derived through `comparisonYears` in `src/lib/portfolio.ts`, independently of full forecast lengths. Why: shortening comparison graphs must not change authoritative financial calculations.
- Numeric displays and text-based numeric inputs share `src/lib/format.ts`; format presentation only and retain stored numeric precision. Why: consistent locale formatting must not rewrite signed-off calculations or historical assumptions.
- Forecast expense detail is derived for presentation through `src/lib/forecast-opex.ts` from current assumptions and engine rows; retain the engine's authoritative total. Why: expose individual costs without modifying signed-off formulas or stored outputs.
- The engine excludes per-passenger variable cable car cost and revenue-based maintenance capex (removed from the formulas at the user's request on 2026-10-18); both keys remain in the `Assumptions` type and stored JSON only so earlier versions and the example file still load, and new saves tag `mountain-v2`. Why: the user wants those costs out of the calculation entirely, while historical inputs must still open.

- The engine carries tax losses forward indefinitely: negative taxable income (EBIT minus interest) accumulates and offsets later profits before tax is charged (added 2026-10-18 at user request).
- Project benchmarking selections (comparables, weights, years, threshold) live in `projects.benchmark_config`; benchmark records stay in `benchmark_assets`/`benchmark_records`, and suggestions are applied only through the normal autosave as a new scenario version. Why: benchmarks stay separate from project assumptions and every applied change is versioned and undoable.
- Comparison has two subpages (`/comparison/projects`, `/comparison/benchmarks`); `/comparison` redirects. Year 3 = engine row index 2 (third operating year), and Year 3 splits, project IRR/payback/FCF and benchmark statistics are presentation-only derivations in `src/lib/year3.ts` and `src/lib/year3-bench.ts`. Why: the signed-off engine stays untouched while comparisons update live from assumptions.
- "Use Benchmark as Project Basis" converts benchmark metrics into existing inputs (ticket prices, cable car fixed OPEX, restaurant revenue/OPEX year 1) via `src/lib/benchmark-basis.ts`, one cost metric per business so statements reconcile, with a provenance snapshot in `benchmarkBasis` inside the scenario JSON; applies through normal autosave. Why: every operating year recalculates through the signed-off engine, no Year 3 overrides, and later benchmark edits never alter saved scenarios.
- F&B benchmark selections live per scenario as `fbBenchmark` in assumptions JSON; `withFbBenchmark` normalizes selected sources to passenger-adjusted mode and `fbFollowsPassengers`, scales each figure by year-3 project passengers over its own cable car passengers, and back-computes year-1 inputs using `fbEscalator`. Missing sources retain their amounts with warnings; manual scenarios remain unchanged. Apply normalization through scoped autosave, including legacy unadjusted selections. Why: selected restaurant figures always reflect project passengers without changing engine formulas or deleting historical versions.
