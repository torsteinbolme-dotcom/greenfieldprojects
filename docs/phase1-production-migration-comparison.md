> **Historical Phase 1 evidence / planning document.** Status statements below describe the assessment at that time. Phase 1 is subsequently reported released. See the [release record](financial-engine-v1/phase1-release-record.md) for current evidence and limitations. This document is retained unchanged below this banner; it is not authorization to execute SQL or release actions.

# Production migration ledger comparison — 21 October 2026

## Result

The user-supplied export contains 12 rows. All 12 hashes match the exact repository SQL bytes for migrations 0000–0011, and all 12 `created_at` values exactly match their corresponding journal `when` values. No unknown hashes, missing earlier migrations, duplicate hashes/IDs/timestamps, or timestamp mismatches were found. Correspondence was established by SHA-256, not numeric IDs.

`0012_preserve_saved_fb_opex_growth.sql` is pending according to this exported ledger: its hash is absent and its journal timestamp is later than every exported entry. The user-reported enabled trigger is consistent with the corrective migration not having taken effect.

## Per-file comparison

| SQL file | Export ledger ID (matched by hash) | Journal/ledger timestamp (milliseconds) | Status |
|---|---:|---:|---|
| `0000_portfolio_schema.sql` | 1 | 1792322658045 | Recorded applied |
| `0001_latest_assumptions_view.sql` | 2 | 1792322692747 | Recorded applied |
| `0002_benchmarks.sql` | 3 | 1792329640688 | Recorded applied |
| `0003_project_benchmark_config.sql` | 4 | 1792329912349 | Recorded applied |
| `0004_benchmark_forecast_status.sql` | 5 | 1792330223794 | Recorded applied |
| `0005_project_cover_image.sql` | 6 | 1792348839224 | Recorded applied |
| `0006_project_cover_url_comment.sql` | 7 | 1792348894487 | Recorded applied |
| `0007_default_independent_fb_opex_growth.sql` | 8 | 1792358321063 | Recorded applied |
| `0008_create_seasonality_profiles.sql` | 9 | 1792406839041 | Recorded applied |
| `0009_atomic_seasonality_import.sql` | 10 | 1792409543619 | Recorded applied |
| `0010_audit_tenant_relationship_guards.sql` | 11 | 1792410369609 | Recorded applied |
| `0011_migration.sql` | 12 | 1792417990011 | Recorded applied |
| `0012_preserve_saved_fb_opex_growth.sql` | — | 1792585200000 | Pending (absent from export) |

## Evidence and limits

- Export: `query-results-export-2026-10-21_22-46-34.csv`; exact-file SHA-256 `b1bfdee4f515dc9e8ceb14d99bd85a0fec03ee8d794a137fad1181acec283673`. The original export remains outside the repository; no production connection was made.
- Comparison uses `drizzle/migrations/meta/_journal.json` and exact SQL file bytes. Full SQL hashes are recorded in `phase1-migration-fingerprints.json`.
- Latest ledger timestamp is `1792417990011`, or **2026-10-19 13:53:10.011 UTC**, matching `0011_migration.sql` exactly. In the installed Drizzle PostgreSQL migrator, `created_at` stores the journal timestamp, not the actual execution clock. This does not establish when or how SQL ran.
- The export records migration history at inspection time. It does not prove current schema/function bodies equal those migrations, exclude manual SQL or later rollback, or establish historical assumption integrity. A manually altered ledger cannot be ruled out from an export alone.
- The original enabled F&B trigger and aggregate results (306 versions; 108 legacy; 1 matching pattern; 0 candidate scenarios) remain user-reported evidence. No historical assumptions were rewritten.

## Release recommendation

**NO-GO for merge/release remains.** The migration-ledger matching gate is now satisfied; actual Lovable active-branch synchronization and database execution behaviour remain unverified. Do not infer that a manual frontend Publish gate prevents backend SQL execution. Establish the actual migration gate and approve a controlled release/rollback procedure before merging the migration-bearing PR. No merge, deployment or migration execution was performed.
