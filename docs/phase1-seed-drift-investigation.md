> **Historical Phase 1 evidence / planning document.** Status statements below describe the assessment at that time. Phase 1 is subsequently reported released. See the [release record](financial-engine-v1/phase1-release-record.md) for current evidence and limitations. This document is retained unchanged below this banner; it is not authorization to execute SQL or release actions.

# Phase 1 seed drift investigation and release decision — 21 October 2026

## Superseding assessment — 22 October 2026

The [final backward-compatibility assessment](phase1-backward-compatibility.md) covers historical client families and now supports a controlled migration-first GO within that scope, subject to operational preflight and explicit approvals. This supersedes the exact-published-SHA blocker in the earlier decision below; artifact identity remains unverified. Seed correction and rehearsal evidence below remain valid.

## Earlier decision — 21 October 2026

**The reviewed migration candidate passes isolated technical checks. NO-GO for the complete production release until the published application revision is identified or its actual persistence path is checked against the migrated backend.** The seed incompatibility is resolved in the revised candidate. Production execution, merge and publication still require separate approval; none occurred.

## Why the seed hash differs

The user-supplied export `query-results-export-2026-10-21_23-04-24 (2).csv` contains the production function definition. Exact file SHA-256: `9389db89fe02da0d8138a9e0bb303f8e819cbbd7ec713e76522ccc16d91e1231`. The original CSV remains outside the repository; the reviewed function definition alone is included as `scripts/fixtures/phase1-production-seed.sql`, containing example inputs but no user records or credentials.

| Value | Meaning |
|---|---|
| `9bc90882dbbe580fe2f2a21b9bc46ba1` | Body MD5 of repository seed from migration 0000 |
| `dba5cac31a644e281737569429904ec6` | Exact body MD5 independently calculated from exported dollar-quoted body; matches the earlier reported production body hash |
| `b959a14314626e9a06da94947f57ff18` | Exact MD5 of the entire exported `pg_get_functiondef` text, despite the CSV column label `seed_body_hash` |
| `16f91e1d10c86c988cf9713e8fba778e` | Expected production body MD5 after the revised 0012 |

The difference is substantive, not merely formatting:

1. Production first checks `organization_invites` using `NEW.raw_user_meta_data->>'invite_token'`, an unaccepted/unexpired invitation and case-insensitive email equality. A match adds membership with the invited role, marks acceptance and returns without creating a new organization or sample project.
2. Otherwise it creates an organization, admin membership, Project Mountain, Base scenario and first assumptions version.
3. The production sample horizon is **15 years**, while the repository sample is **30 years**. Parsed sample JSON differs only in `years`; all other sample inputs match. Production body formatting is also compacted.

The available Git history is not shallow. Migration 0000's seed file has one recorded introduction (`3566d14`); migrations 0001–0011 contain no replacement for it and no creation of `organization_invites`. Generated database types recognize invitations (history includes `6a9a8e1`), and existing auth/settings code uses invitations. Thus the exported implementation matches existing application features, but cannot be reconstructed from the tracked migration chain alone. The actor, execution time and change mechanism cannot be established from this export or ledger; attributing it to a particular Cloud action would be speculation. **Ledger hashes remain consistent; untracked schema/function evolution is a separate confirmed discrepancy.**

## Correction and compatibility

The earlier 0012 safely refused the production body. Bypassing its guard would have removed invitation onboarding and reset the sample horizon. Do not execute that earlier candidate or simply whitelist the new hash while keeping its old replacement body.

Revised 0012 recognizes only the two reviewed original body hashes. It obtains the actual function definition from PostgreSQL and changes only the sample JSON fragment adding `opexGrowth.fb=[0.025,0.025,0.025]`, exactly what the original insert trigger supplied. The complete invitation path, early return, role, acceptance behavior, 15-year sample horizon, other assumptions and function settings remain intact. The expected resulting body hash is checked before replacement. Unknown bodies, changed security attributes, missing auth/F&B triggers or missing invitation table/metadata dependencies fail closed. The PostgreSQL DO block is atomic, and the approved runner should also record the ledger transactionally.

CREATE OR REPLACE retains the function OID, owner and ACL; auth trigger references remain intact. The enabled AFTER INSERT/FOR EACH ROW auth trigger supplied by the user matches the expected event. The migration validates its function reference, timing/event flags and enabled state. The F&B default function is retained while only its reviewed insert trigger is removed. No table, policy, scenario or historical assumption is rewritten.

Rollback now recognizes only the two reviewed post-migration bodies and reverses only the inserted JSON defaults. It restores the corresponding original implementation, including production invitations and the 15-year example; it never restores the repository body over production's body. It rejects unexpected bodies, existing default triggers and missing retained default functions. It remains a reviewed manual rollback with explicit transaction, not an idempotent operation. It restores the known save-time defect; pause writes and review ledger handling before use. Reverting the frontend alone does not reverse the database migration.

Current revised 0012 SQL SHA-256: `0880280944d60caed0b5cca5c588aa6ba40d1bf71d0c1f56023fcdbdc3690c7d`. Journal timestamp/filename remain unchanged because 0012 is unapplied in the supplied production ledger. No applied migration 0000–0011 was edited.

## Isolated rehearsal and unchanged scenarios

- **30 checks passed** with the exact exported production body; **26 checks passed** with the original repository body. Both replay all 12 tracked migration SQL files before applying 0012. The exported variant then loads the reviewed function and a minimal invitation dependency table.
- Six invitation paths are tested before migration, after migration and after rollback: valid (including email case), expired, already accepted, wrong email, missing token and revoked/missing invitation. Membership, role, acceptance, organization creation and sample/no-sample behavior are asserted. Ordinary signup retains exactly the same example JSON and full engine outputs.
- Apply, rollback and reapply pass. Unknown/missing seed functions, unexpected security attributes, missing auth/F&B triggers, missing invitation table and rollback on an unmigrated body are rejected.
- Apply leaves **8 existing assumption fixture rows** exactly unchanged. Rollback leaves **15 historical/new rows** exactly unchanged. Existing organizations, memberships, projects, scenarios and invitation records also compare exactly before/after both operations. Signup test inserts are isolated or separately accounted for. These are local fixtures, not production snapshots.
- Six legacy/empty/explicit/passenger-linked/benchmark cases retain exact saved JSON and complete financial results on Phase 1 and the main-reference engines. Historical outputs remain identical within each engine. Original F&B save defect reproduces 112.75 → 102.50; corrected save/reload stays 112.75.
- Function OID, owner, grants, security-definer setting, search path, auth/non-target triggers, RLS policy definitions and constraints remain unchanged across migration; rollback restores the original catalog definitions.
- Full financial suite rerun: **494 passed, 0 failed, 0 skipped**. Existing disposable database regression also passes. No financial engine/UI code, user assumptions or dependency manifests were changed in this follow-up.

Evidence: `phase1-production-seed-rehearsal-results.json`, `phase1-release-rehearsal-results.json`, and `scripts/rehearse-phase1-release.mjs`. Reproduce with an installed PGlite module: `node scripts/rehearse-phase1-release.mjs /path/to/pglite/dist/index.js --production-seed`; omit the final flag for repository seed coverage. PGlite was already available outside this repository; no dependency installation or lockfile change was required.

Limitations: isolated PostgreSQL 18.6 / PGlite 0.5.10, privileged schema owner, local auth/storage stubs and a minimal invitation table model. This is real SQL/PLpgSQL execution, not a managed-auth/browser/production-role or backup-restore rehearsal. Production function settings declared in the export (PL/pgSQL, security definer, public search path) are preserved; live owner/ACL values were not exported and cannot be independently certified. PL/pgSQL runtime references are not comprehensively catalogued in pg_depend.

## Published application and remaining risks

Source compatibility is established against main `5ca84c7042dabb18276c920d31cf193e5480e257`. Its auth code sends invite metadata; its existing persistence API appends submitted assumptions; its template helpers supply creation defaults. Revised 0012 preserves these paths. Tables, columns, policies and RPC APIs are unchanged. The exact published build has not been identified or accessed, so live-build parity remains the outstanding release evidence gap. If it matches this reference, record that confirmation; otherwise inspect/smoke-test the actual build on an isolated backend.

The known invitation race/duplicate-token and role/permission behavior is preserved rather than redesigned; this phase makes no claim to fully audit invitation security or concurrency. Keep existing historical assumptions, including explicit lists previously supplied by the trigger. Aggregate results (306 total; 108 legacy; 1 pattern match; 0 candidate scenarios) are indicative, not proof of historical integrity. Backup availability does not demonstrate a successful restore or eliminate the recovery-point gap since 21 October 2026 04:58:08 UTC.

## Controlled release sequence — proposed, not executed

1. Confirm the published build/revision and its persistence/onboarding compatibility. Freeze the revised PR commit and migration/rollback hashes; discard approval references to the earlier 0012 bytes.
2. Authorized operator performs a fresh read-only preflight: expected production body `dba5cac31a644e281737569429904ec6`, auth and F&B trigger definitions/enabled state, invitation dependencies, owner/settings/permissions and ledger 0000–0011 only. A differing body stops the release. Record unchanged-row verification and an acceptable backup/recovery point.
3. With explicit merge approval, merge PR #1 and verify the synchronized revision. User-supplied Lovable confirmation states GitHub synchronization does not execute Drizzle SQL and frontend publication is separate.
4. Pause writes for the controlled migration window. With separate migration approval, use the designated transaction/ledger workflow to apply revised 0012 once. If Lovable uses manual SQL, agree correct ledger recording before execution; do not run SQL and leave a misleading pending entry or edit ledger history ad hoc.
5. Verify new body `16f91e1d10c86c988cf9713e8fba778e`, retained auth/invitation behavior, absence only of the F&B insert trigger, correct ledger, and unchanged pre-existing rows. Run authorized disposable signup/invitation/save/reload smoke tests without editing historical records.
6. With separate publication approval, publish the reviewed frontend, verify financial reference results and smoke tests, then resume writes and monitor.
7. On failure, keep writes paused. Review actual catalog/ledger before separately approved guarded rollback and prior-frontend restoration. Verify restored production body/invitations and unchanged rows. Rollback does not remove versions created since migration, does not automatically remove its ledger entry, and restores the known save-time defect. Subsequent forward reapplication needs an explicit runner/ledger plan. Backup restore is a separate operator decision because later writes may be lost.

No production connection, record modification, migration execution, PR merge or publication occurred. All changes remain on `phase1/financial-integrity`.
