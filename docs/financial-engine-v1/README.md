# Financial Engine v1.0 baseline

Documentation-only financial baseline of published source `c18d1444998c58619e76e9e7fcbf7cb5e7d6b90f`, established on `baseline/financial-engine-v1`.

1. [Implemented financial specification](specification.md): formulas, method precedence, inputs/outputs, validation and test references.
2. [Calculation dependency map](dependency-map.md): core, adapters, derived returns and persistence boundaries.
3. [Reproducible testing and runtime investigation](testing.md): Node 24.19.0, 494/494, Node 22/Bun differences and proposed golden-test safeguards.
4. [Phase 1 historical release record](phase1-release-record.md): merge/publication/migration identities, evidence limits and outstanding operational checks.
5. [Prioritized architecture recommendations](safeguards.md): future improvements only, no refactor.
6. [Machine-readable baseline evidence](baseline-evidence.json).

The release label v1.0 does not change persisted `mountain-v5-volume`, formulas, fixtures, application behavior, migration files or user data. Test tooling adds runtime pins, a guarded full-suite command and a read-only cross-runtime diagnostic. Older planning documents carry historical banners with their original content preserved below. No merge, migration, production access or deployment is part of this baseline task.
