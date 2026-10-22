# Reproducible financial testing — v1.0

## Canonical environment and actual result

On 22 October 2026, the complete existing suite at source `c18d1444998c58619e76e9e7fcbf7cb5e7d6b90f` passed **494/494 tests, 50 test files, zero skipped, zero failed** on **Node 24.19.0 / V8 13.6.233.17-node.51, macOS arm 64**. Installation used **Bun 1.4.4 as package manager only**, `bun install --frozen-lockfile`; Vitest 4.1.11, Vite 8.1.5 and jsdom 20.0.3 came from the existing lock. The canonical execution used Node, not Bun. No fixtures, financial sources or lockfile were changed. Structured evidence: [baseline-evidence.json](baseline-evidence.json).

`.nvmrc` and `.node-version` pin 24.19.0. `test:baseline` / `scripts/test-financial-baseline.mjs` reject any other runtime (including Bun), then start the existing full Vitest suite using that exact Node executable. The existing `test` command remains available and unchanged. A future Node patch/platform adoption needs an explicit baseline comparison; major 24 alone is not a promise of identical hashes. These files configure testing; they do not change Lovable's production runtime or publish anything. Node type declarations remain as locked; this PR does not upgrade them.

From a clean checkout, with Bun 1.4.4 and Node 24.19.0 installed using trusted version-management tools:

```sh
node --version
bun --version
bun install --frozen-lockfile
node scripts/test-financial-baseline.mjs
```

Optional machine-readable report (keep artifacts outside the repository):

```sh
node scripts/test-financial-baseline.mjs --reporter=json --outputFile=/tmp/greenfields-node24-results.json
```

`npm run test:baseline` is equivalent when npm is available under the selected Node version. Do not use `bun test` (a different runner), `bun --bun ...` (Bun runtime), `npm install` to generate another lock, or a dependency update to obtain a passing canonical result. Do not execute any database or rehearsal script as part of this baseline command. The default suite has mocked/local test boundaries and does not require production access.

## Controlled Node 22 / Bun investigation

The same clean frozen-lock dependencies and source ran under three runtimes:

| Execution                                                                                            | Result                                                                      | Explanation                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node 24.19.0, V8 13.6.233.17-node.51                                                                 | 494 passed /494                                                             | Approved exact baseline reproduced                                                                                                                                                                  |
| Node 22.23.4, V8 12.4.254.21-node.57                                                                 | 490 passed, 4 failed /494                                                   | Four `phase1-compatibility.test.ts` whole-result SHA checks: investmentA, B, C and zero-F&B-revenue fixed-cost case                                                                                 |
| Bun 1.4.4 revision 38 afee 6 c 8, WebKit d 6375 c 72 affe 0 f 70222 cdcb 45012 b 10 f 0 bf 3 a 9 d 5 | 484 passed, 9 failed /493 collected; additionally 1 file collection failure | Nine whole-result SHA checks; `app-routing.test.tsx` fails to collect its 1 test with `undefined is not an object (evaluating 'z.object')`. Not a 494-test pass and not all failures are financial. |

Bun exposes a compatibility `process.version` of v26.3.0; it must not be reported as execution under actual Node 26. Runtime evidence explicitly records `process.versions.bun` and WebKit identity. The routing error's underlying module/interoperability cause was not isolated and is not corrected here.

To reproduce the full comparison after selecting each exact runtime executable, run that executable against `node_modules/vitest/vitest.mjs run --reporter=json --outputFile=...`. For Bun use `bun --bun node_modules/vitest/vitest.mjs run ...`, ensuring worker processes use Bun. Use distinct output paths. The diagnostic below independently confirms runtime identity; do not infer it from the package manager.

### Arithmetic versus serialization

`scripts/diagnose-financial-runtime.ts` is a read-only diagnostic, not a test/fixture generator. It runs the five unchanged saved scenarios plus five unchanged investment cases, reporting full numeric leaves as decimal values **and binary 64 hexadecimal bits**, plus SHA of the engine JSON, Year 8 returns and project-return derivations. Build once with the tested Bun version, then execute the same emitted JavaScript under each runtime:

```sh
bun build scripts/diagnose-financial-runtime.ts --target=node --outfile=/tmp/greenfields-runtime-diagnostic.mjs
node /tmp/greenfields-runtime-diagnostic.mjs > /tmp/greenfields-runtime-node24.json
# Substitute an explicit Node 22.23.4 executable for node in the next command.
/path/to/node22 /tmp/greenfields-runtime-diagnostic.mjs > /tmp/greenfields-runtime-node22.json
bun /tmp/greenfields-runtime-diagnostic.mjs > /tmp/greenfields-runtime-bun.json
```

Compare `cases[i].leaves[path].bits`, then absolute/relative numeric deltas and engine hashes; never upload scenario data or full diagnostic outputs to a third-party service. The fixtures are existing repository test inputs, not a fresh production export. Bundling only strips/links source for this experiment; canonical acceptance remains the actual Vitest run.

Observed ten-case comparison to Node 24:

| Measurement                                                 |                Node 22 |                   Bun |
| ----------------------------------------------------------- | ---------------------: | --------------------: |
| Identical full engine JSON hashes                           |                   6/10 |                  1/10 |
| Different numeric leaves (engine + derived outputs)         |                     13 |                   315 |
| Maximum absolute delta                                      |  2.9802322387695312e−8 |    9.5367431640625e−7 |
| Maximum relative delta over changed leaves                  | 3.5106365209733863e−16 | 1.667463947450218e−14 |
| Maximum bit-step distance for these positive changed values |                  2 ULP |               113 ULP |

Node 22 differences appear in Year 15 cost/maintenance and dependent fields; sampled Year 3 EBITDA, Year 8 IRR/MOIC and project IRR were exactly unchanged. Bun also changes some Year 8 returns at about 1e−16 and project IRR at about 1e−16. These are observations for the fixtures/runtime/platform tested, not bounds for every possible model or browser.

A direct probe isolates a real arithmetic difference **before JSON serialization**:

| `Math.pow(1.025,14)` | Decimal            | Binary 64 bits     |
| -------------------- | ------------------ | ------------------ |
| Node 24              | 1.4129738209737657 | `3ff69b8a6ff2fbd5` |
| Node 22              | 1.4129738209737654 | `3ff69b8a6ff2fbd4` |
| Bun                  | 1.4129738209737661 | `3ff69b8a6ff2fbd7` |

The fallback cost-index exponentiation feeds actual financial differences. SHA over `JSON.stringify(result)` magnifies a last-bit change into an unrelated hash. Calling this solely a serialization bug would be inaccurate. Not every Bun difference has been traced to a unique primitive/JIT decision; no claim is made that every difference is caused solely by `Math.pow`. The ECMAScript [Math.pow definition](https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-math.pow) delegates to Number exponentiation, whose finite general case is implementation-approximated; see [Number::exponentiate](https://tc39.es/ecma262/multipage/ecmascript-data-types-and-values.html#sec-numeric-types-number-exponentiate). The measured hexadecimal differences are direct experimental evidence, not an inference from that allowance.

### Golden-test strategy — proposed, not implemented

Keep the approved exact Node 24 hashes and fixtures. They are valuable protection for code changes within a controlled runtime. Do not regenerate expected hashes on a developer's current runtime, round production outputs, change operation order, or introduce decimal arithmetic to make this baseline portable.

A separately reviewed second layer should compare structured numeric outputs with:

- Exact key sets, row counts/order, nulls, identifiers, active-method selection and input nonmutation; reject every NaN/Infinity and type mismatch.
- Field-specific absolute **and** relative error budgets, with ULP distance as a diagnostic. Approve units and limits per money/count/rate/IRR field against independent references and economic materiality. The observed 113-ULP small-tax case shows why a universal 2-ULP gate is insufficient; the observed sub-micro-NOK maximum does not justify a blanket monetary tolerance for arbitrary scales.
- Independent literal cases for ticket VAT/commission, debt/interest, loss carryforward, maintenance, equity injections, terminal debt/cash and project tax. Use analytical IRR cases and NPV-residual checks; never compute expected values by calling the same helper being tested.
- Reconciliation/invariants: tickets=passengers×net fare; revenue/OPEX components sum; opening debt−principal=closing debt; cumulative funding/distributions/cash reconcile; unlevered returns exclude financing; retained cash and exit cash counted once.
- Diagnostic path/value/delta reports on failure. Hash mismatch remains a real canonical failure even if a secondary tolerance passes. No automatic acceptance or fixture rewrite.

Tolerance changes need their own review and stress testing near zero, sign changes, step thresholds and multiple-sign IRR sequences. The existing sandbox comparison tolerance is a purpose-specific reconciliation rule, not authority to apply it globally to golden tests.

## Environment issues and verification limits

Initial Documents checkout reads stalled because macOS files were marked `dataless`; its first test attempt never produced a result and is not counted as pass/fail. An old mixed dependency cache then failed with missing `@vitest/utils`; it was not used for accepted results. A separate `/tmp` checkout and clean frozen-lock installation resolved both. Existing source/lockfile identities were checked, and final Node 24 acceptance was repeated through the new wrapper.

Reproducibility established here: clean locked installation and complete suite on macOS arm 64 with the recorded runtime. Linux/x 64, browser portability, a production build, production database state, production smoke tests and security scan were not independently verified by this task. Historical database rehearsal results are retained separately and were not rerun or folded into the 494 count. No production access, SQL execution or migration command was needed.
