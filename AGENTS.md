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
- `src/test/` has its own `AGENTS.md`; read it before changing tests.
- Preserve the engine and example except requested formula changes. Why: signed-off calculations.
- Compute from append-only JSON; `lib/sandbox.ts` uses cloned overrides, never saves. Why: auditability and isolation.
- Every table has `organization_id`; RLS uses `is_org_member` / `can_edit_org` / `is_org_admin` (security definer). Why: isolation.
- Scenario saves insert new versions; Base is never overwritten by other scenarios. Why: isolation and version history.
- Version reads fail explicitly; unique-version collisions retry (bounded); org relationships and Base identity are DB-guarded. Why: no corrupted history or tenancy.
- Signups get their own organization and seeded Mountain via `handle_new_user`. Why: working examples.
- Ticket ratios live in scenario JSON; use `src/lib/ticket-pricing.ts` for edits/calculations/saves; `withDefaultProjectSegments` only for new templates. Why: preserve saved fares and history.
- Use scoped serial autosave for assumptions and project details, including name (metadata only); undo saves a snapshot, never deletes history. Why: edits survive requests and stay isolated.
- Comparison display years derive through `comparisonYears` in `src/lib/portfolio.ts`, independent of full forecast lengths. Why: shortening comparison graphs must not change authoritative calculations.
- Numeric displays and text inputs share `src/lib/format.ts`; retain stored precision. Why: locale formatting must not rewrite calculations or saved assumptions.
- Forecast expense detail derives for presentation through `src/lib/forecast-opex.ts`; the engine total stays authoritative. Why: expose costs without touching signed-off formulas.
- Engine v3 (saves tagged `mountain-v3`): variable cable OPEX per passenger, opt-in `maintenanceCapexPct` (absent = 0; legacy `maintenanceCapexRate` inert, never surfaced as UI warnings) and automatic equity injections keeping closing cash ≥ 0, counted in IRR/MOIC. Tax losses carry forward; depreciation stops at full write-off; zero-Y1-revenue legacy ancillary OPEX stays fixed. Why: returns must be funding-complete.
- Project benchmarking selections live in `projects.benchmark_config`; records stay in `benchmark_assets`/`benchmark_records`; suggestions apply only via normal autosave as a new version. Why: benchmarks stay separate and every change is versioned.
- Comparison has two subpages (`/comparison/projects`, `/comparison/benchmarks`); `/comparison` redirects. Year 3 = engine row index 2; Year 3 splits, IRR/payback/FCF and benchmark statistics are presentation-only derivations in `src/lib/year3.ts` and `src/lib/year3-bench.ts`. The header MOIC is always Year 8 via `moicAtYear` in `src/lib/portfolio.ts`, whatever exit year a scenario saves. Why: the engine stays untouched while comparisons update live.
- F&B selections and frozen per-line snapshots live in scenario assumptions; replace snapshots only via confirmed refresh; totals stay in the engine. Why: benchmark edits cannot silently change forecasts.
- The overview EBITDA bridge derives from engine rows and forecastOpex in `src/lib/ebitda-bridge.ts`. Why: every split reconciles with authoritative totals.
- Break-even is a read-only engine sensitivity in `src/lib/break-even.ts`. Why: costs and tax-loss history stay consistent with the engine.
- Summary/PPTX and comparisons share engine-backed unit economics; `presentation-*` isolates exports. Why: consistent totals.
- `costIndex`/`merchOpexAt` read OPEX growth and merch shares; a set F&B OPEX growth list solely drives F&B OPEX after Year 1 (no passenger scaling). Missing F&B growth defaults to cost inflation; preserve history and benchmark flags. Why: no revenue/cost double growth.
- Photos: private `project-covers`, path `<org>/<project>.<ext>` in `projects.cover_image_url`; UI signs URLs. Defaults only without a saved path; uploads wait neutrally. Why: privacy and no default flash.
- Capacity validation is nonfinancial; scenario-keyed distribution drafts require valid explicit Save. Profile imports are org-scoped and atomic; averages count each normalized year once, attribution is frozen. Why: isolation and provenance.
- Seasonal JSON uses `seasonal-pricing.ts` for linked fares and allocation weights; retain flat F&B growth (v4-seasonal). The scenario-keyed ticket tab owns the base fare and reads Year 1 (row 0). Why: base-year pricing and isolated navigation.
- Project delete is soft; RLS hides deleted projects/scenarios. Why: recoverable.
- Optional methods preserve legacy/inactive inputs and frozen scenario snapshots. Cable OPEX snapshots set fixed cost, zero variable cost, restore manual on deselection. Why: isolation and no double costs.
- Advanced Calculations: per-scenario module flags/inputs live in assumptions JSON `advanced`; `resolveAssumptions` in `src/lib/advanced.ts` (called by `safeCalculate`) writes only each module's whitelisted fields on a clone (commercial revenue via the revenue-only `perPassengerSeries` method). Why: one engine, no double counting, standard inputs preserved.
