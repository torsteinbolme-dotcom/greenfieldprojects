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
- Preserve `src/financialEngine.ts` and `src/exampleProject.ts` except explicitly requested formula changes. Why: calculations are signed off.
- Outputs are computed client-side from stored inputs (`scenario_assumptions` JSONB, append-only versions); never store hand-edited outputs. Why: deterministic, auditable results.
- Every table has `organization_id`; RLS uses `is_org_member` / `can_edit_org` / `is_org_admin` (security definer). Why: organizations must never see each other's data.
- Scenario saves insert new versions; Base is never overwritten by other scenarios. Why: isolation and version history.
- New signups get their own organization plus a seeded Project Mountain (`handle_new_user` trigger). Why: every account starts with a working example.
- Ticket ratios live in scenario JSON; use `src/lib/ticket-pricing.ts` for edits/calculations/saves; `withDefaultProjectSegments` only for new templates. Why: preserve saved fares, history and the authoritative example.
- Use the scoped serial autosave controller for editable assumptions and text details; undo creates a new saved snapshot, never deletes history. Why: edits during requests survive and histories stay isolated.
- Comparison display years derive through `comparisonYears` in `src/lib/portfolio.ts`, independent of full forecast lengths. Why: shortening comparison graphs must not change authoritative calculations.
- Numeric displays and text inputs share `src/lib/format.ts`; retain stored precision. Why: locale formatting must not rewrite calculations or saved assumptions.
- Forecast expense detail derives for presentation through `src/lib/forecast-opex.ts`; the engine total stays authoritative. Why: expose costs without touching signed-off formulas.
- Engine v3 (saves tagged `mountain-v3`): variable cable OPEX per passenger, opt-in `maintenanceCapexPct` (absent = 0; legacy `maintenanceCapexRate` inert, never surfaced as UI warnings) and automatic equity injections keeping closing cash ≥ 0, counted in IRR/MOIC. Tax losses carry forward indefinitely. Why: returns must be funding-complete.
- Project benchmarking selections live in `projects.benchmark_config`; records stay in `benchmark_assets`/`benchmark_records`; suggestions apply only via normal autosave as a new version. Why: benchmarks stay separate and every change is versioned.
- Comparison has two subpages (`/comparison/projects`, `/comparison/benchmarks`); `/comparison` redirects. Year 3 = engine row index 2; Year 3 splits, IRR/payback/FCF and benchmark statistics are presentation-only derivations in `src/lib/year3.ts` and `src/lib/year3-bench.ts`. The header MOIC is always Year 8 via `moicAtYear` in `src/lib/portfolio.ts`, whatever exit year a scenario saves. Why: the engine stays untouched while comparisons update live.
- F&B selections and frozen per-line snapshots live in scenario assumptions; replace snapshots only via confirmed refresh; totals stay in the engine. Why: benchmark edits cannot silently change forecasts.
- The overview EBITDA bridge derives from engine rows and forecastOpex in `src/lib/ebitda-bridge.ts`. Why: every split reconciles with authoritative totals.
- Break-even is a read-only engine sensitivity in `src/lib/break-even.ts`. Why: costs and tax-loss history stay consistent with the engine.
- Summary/PPTX read engine outputs; `presentation-*` isolates data, layout and OOXML repair. Why: deterministic outputs and valid editable charts.
- `costIndex`/`merchOpexAt` read OPEX growth and merch shares; manual F&B grows year-1 costs only. Templates/insert triggers default missing F&B growth from cost inflation; preserve history and benchmark flags. Why: no revenue/cost double growth.
- Project photos: private `project-covers` bucket, path `<org>/<project>.<ext>`; `projects.cover_image_url` stores that path and the UI signs URLs (`src/lib/covers*.ts`). Why: public buckets are blocked.
- Capacity stays outside the engine in scenario JSON; distributions are local drafts until valid explicit Save; key the editor by scenario. Why: protect forecasts and isolate drafts.
- Seasonality uses validated 12-month profiles and an org-scoped transactional import RPC; annual/normalized profiles count once in averages. Applying copies normalized percentages plus frozen source attribution into the capacity draft, never read by the engine. Why: atomic replacement, provenance and financial isolation.
