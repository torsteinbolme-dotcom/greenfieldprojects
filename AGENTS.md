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
- Preserve the engine and example except requested formula changes. Why: signed-off calculations.
- Compute outputs client-side from append-only scenario JSON; never store edited outputs. Why: auditable results.
- Every table has `organization_id`; RLS uses `is_org_member` / `can_edit_org` / `is_org_admin` (security definer). Why: organizations must never see each other's data.
- Scenario saves insert new versions; Base is never overwritten by other scenarios. Why: isolation and version history.
- Scenario version reads must fail explicitly and unique-version collisions retry within a bounded limit; organization relationships and Base identity are guarded in the database. Why: concurrent saves and raw requests must not corrupt history or tenant relationships.
- Audit investment fixtures use independent literal financial references and explicit expected-failure tests for unresolved signed-off formula defects; the disposable browser security regression must never target existing records. Why: passing test execution must not conceal unresolved economics or endanger user data.
- Signups get their own organization and seeded Mountain via `handle_new_user`. Why: working examples.
- Ticket ratios live in scenario JSON; use `src/lib/ticket-pricing.ts` for edits/calculations/saves; `withDefaultProjectSegments` only for new templates. Why: preserve saved fares, history and the authoritative example.
- Use scoped serial autosave for assumptions and project details, including name (metadata only); undo saves a snapshot, never deletes history. Why: edits survive requests and stay isolated.
- Comparison display years derive through `comparisonYears` in `src/lib/portfolio.ts`, independent of full forecast lengths. Why: shortening comparison graphs must not change authoritative calculations.
- Numeric displays and text inputs share `src/lib/format.ts`; retain stored precision. Why: locale formatting must not rewrite calculations or saved assumptions.
- Forecast expense detail derives for presentation through `src/lib/forecast-opex.ts`; the engine total stays authoritative. Why: expose costs without touching signed-off formulas.
- Engine v3 (saves tagged `mountain-v3`): variable cable OPEX per passenger, opt-in `maintenanceCapexPct` (absent = 0; legacy `maintenanceCapexRate` inert, never surfaced as UI warnings) and automatic equity injections keeping closing cash ≥ 0, counted in IRR/MOIC. Tax losses carry forward indefinitely; depreciation stops once capex is fully depreciated; legacy ancillary OPEX with zero Year 1 revenue stays a fixed cost. Why: returns must be funding-complete.
- Project benchmarking selections live in `projects.benchmark_config`; records stay in `benchmark_assets`/`benchmark_records`; suggestions apply only via normal autosave as a new version. Why: benchmarks stay separate and every change is versioned.
- Comparison has two subpages (`/comparison/projects`, `/comparison/benchmarks`); `/comparison` redirects. Year 3 = engine row index 2; Year 3 splits, IRR/payback/FCF and benchmark statistics are presentation-only derivations in `src/lib/year3.ts` and `src/lib/year3-bench.ts`. The header MOIC is always Year 8 via `moicAtYear` in `src/lib/portfolio.ts`, whatever exit year a scenario saves. Why: the engine stays untouched while comparisons update live.
- F&B selections and frozen per-line snapshots live in scenario assumptions; replace snapshots only via confirmed refresh; totals stay in the engine. Why: benchmark edits cannot silently change forecasts.
- The overview EBITDA bridge derives from engine rows and forecastOpex in `src/lib/ebitda-bridge.ts`. Why: every split reconciles with authoritative totals.
- Break-even is a read-only engine sensitivity in `src/lib/break-even.ts`. Why: costs and tax-loss history stay consistent with the engine.
- Summary/PPTX and comparisons share engine-backed unit economics; `presentation-*` isolates exports. Why: consistent totals.
- `costIndex`/`merchOpexAt` read OPEX growth and merch shares; a set F&B OPEX growth list solely drives F&B OPEX after Year 1 (no passenger scaling). Missing F&B growth defaults to cost inflation; preserve history and benchmark flags. Why: no revenue/cost double growth.
- Project photos: private `project-covers` bucket, path `<org>/<project>.<ext>`; `projects.cover_image_url` stores that path and the UI signs URLs (`src/lib/covers*.ts`). Why: public buckets are blocked.
- Capacity validation is nonfinancial; scenario-keyed distribution drafts require valid explicit Save. Profile imports are org-scoped and atomic; averages count each normalized year once, attribution is frozen. Why: isolation and provenance.
- Seasonal JSON uses `seasonal-pricing.ts` for linked fares and allocation weights; retain flat F&B growth (v4-seasonal). A scenario-keyed ticket tab owns pricing/revenue and display-year selection. Why: consistent returns and isolated navigation.
- Project delete is soft; RLS hides deleted projects/scenarios. Why: recoverable.

- Optional category methods live in scenario JSON; absent/legacy keeps old formulas, explicit benchmarks use frozen snapshots without rewriting inactive inputs. Why: financial neutrality and isolation.
