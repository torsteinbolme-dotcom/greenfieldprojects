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
- Keep authoritative `src/financialEngine.ts` and `src/exampleProject.ts` verbatim; ask before changing formulas. Why: the user signed off on these investment calculations.
- All outputs are computed client-side from stored inputs (`scenario_assumptions` JSONB, append-only versions); never store outputs edited by hand. Why: results stay deterministic and every version can be audited.
- Every table has `organization_id`; RLS uses `is_org_member` / `can_edit_org` / `is_org_admin` (security definer). Why: one organization must never see another's data.
- Scenario saves insert new versions; Base is separate and never overwritten by other scenarios. Why: isolation and version history.
- New signups get their own organization plus a seeded Project Mountain (`handle_new_user` trigger). Why: every account starts with a working example.
- Optional ticket percentages live in scenario JSON; apply `src/lib/ticket-pricing.ts` before editing, calculating and saving, without changing the engine or example. Why: fare relationships persist per version without rewriting history or formulas.
- Use the scoped serial autosave controller for editable assumptions and text details; undo creates a new saved snapshot and never deletes version history. Why: edits during requests must survive and scenario histories stay isolated.
- Comparison display years are derived through `comparisonYears` in `src/lib/portfolio.ts`, independently of full forecast lengths. Why: shortening comparison graphs must not change authoritative financial calculations.
- Numeric displays and text inputs share `src/lib/format.ts`; retain stored precision. Why: locale formatting must not rewrite calculations or historical assumptions.
- Forecast expense detail is derived for presentation through `src/lib/forecast-opex.ts` from current assumptions and engine rows; retain the engine's authoritative total. Why: expose individual costs without modifying signed-off formulas or stored outputs.
- Engine v3 (user-requested 2026-10-18, saves tagged `mountain-v3`): variable cable OPEX per passenger, opt-in `maintenanceCapexPct` (absent = 0; legacy `maintenanceCapexRate` inert) and automatic equity injections keeping closing cash ≥ 0, counted in IRR/MOIC. Why: returns must be funding-complete.
- The engine carries tax losses forward indefinitely: negative taxable income (EBIT minus interest) accumulates and offsets later profits before tax (2026-10-18 at user request).
- Project benchmarking selections (comparables, weights, years, threshold) live in `projects.benchmark_config`; benchmark records stay in `benchmark_assets`/`benchmark_records`, and suggestions are applied only through the normal autosave as a new scenario version. Why: benchmarks stay separate from project assumptions and every applied change is versioned and undoable.
- Comparison has two subpages (`/comparison/projects`, `/comparison/benchmarks`); `/comparison` redirects. Year 3 = engine row index 2 (third operating year), and Year 3 splits, project IRR/payback/FCF and benchmark statistics are presentation-only derivations in `src/lib/year3.ts` and `src/lib/year3-bench.ts`. Why: the signed-off engine stays untouched while comparisons update live from assumptions.
- F&B selections and frozen per-line source snapshots live in scenario assumptions; replace snapshots only via confirmed refresh; per-line passenger flags use legacy fallbacks; totals stay in the engine. Why: benchmark edits cannot silently change forecasts.
- The overview EBITDA bridge derives from engine rows and forecastOpex in `src/lib/ebitda-bridge.ts`, never from a second calculation engine. Why: every business split reconciles with authoritative totals and unavailable categories stay unallocated.
- Break-even is a read-only engine sensitivity in `src/lib/break-even.ts` (scale the passenger forecast, rederive passenger-linked F&B, solve EBITDA/cashAfterDebt). Why: costs and tax-loss history stay consistent with the engine.
- Investment Summary reads engine outputs directly (incl. additional/total equity). Why: no second calculation path.
- Per-cost OPEX growth lists (`opexGrowth.cable/fb`) and `merchOpexRate` (merch OPEX = % of merch revenue) are optional scenario fields read via `costIndex`/`merchOpexAt`; absent fields fall back to `costInflation` and the legacy ratio (user-approved 2026-10-18). Why: old versions keep identical results.
- Project photos: private `project-covers` bucket, path `<org>/<project>.<ext>`; `projects.cover_image_url` stores that path and the UI signs URLs (`src/lib/covers*.ts`). Why: public buckets are blocked.
- Capacity stays outside the engine in scenario JSON; distributions are local drafts until valid explicit Save; key the editor by scenario. Why: protect forecasts and isolate drafts.
- Only the active maintenance CAPEX percentage calculates maintenance; inert legacy revenue-based rates stay untouched in saved history and are never surfaced as UI warnings. Why: they cannot safely become CAPEX percentages and the user removed the conflict banner.
