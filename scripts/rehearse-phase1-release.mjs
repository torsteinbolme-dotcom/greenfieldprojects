// Isolated, in-memory PostgreSQL only; no URL, network or production connection.
// Usage: node scripts/rehearse-phase1-release.mjs /absolute/path/to/pglite/dist/index.js
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "vite";
import ts from "typescript";
const { PGlite } = await import(process.argv[2]);
const git = process.env.PHASE1_GIT ?? "git";
const baseline = "5ca84c7042dabb18276c920d31cf193e5480e257";
const oldSource = (path) =>
  execFileSync(git, ["show", `${baseline}:${path}`], { encoding: "utf8" });
const oldEngine = oldSource("src/financialEngine.ts")
  .replaceAll("'./lib/", "'/src/lib/")
  .replace("'/src/lib/advanced-operations'", "'virtual:phase1-old-operations'");
const oldOperations = oldSource("src/lib/advanced-operations.ts")
  .replaceAll("'./", "'/src/lib/")
  .replaceAll('"./', '"/src/lib/');
const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false, ws: false },
  plugins: [
    {
      name: "read-only-main-reference",
      resolveId(id) {
        if (id.startsWith("virtual:phase1-old-")) return "\0" + id;
      },
      load(id) {
        if (id === "\0virtual:phase1-old-engine")
          return ts.transpileModule(oldEngine, {
            compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
          }).outputText;
        if (id === "\0virtual:phase1-old-operations")
          return ts.transpileModule(oldOperations, {
            compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
          }).outputText;
      },
    },
  ],
});
const db = new PGlite();
const checks = [];
const check = (name, fn) => {
  fn();
  checks.push(name);
};
const sql = (path) => readFile(path, "utf8");
const snapshot = async () =>
  (await db.query("SELECT * FROM public.scenario_assumptions ORDER BY id")).rows;
const fingerprint = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
try {
  const { calculate } = await vite.ssrLoadModule("/src/financialEngine.ts");
  const { calculate: oldCalculate } = await vite.ssrLoadModule("virtual:phase1-old-engine");
  const { phase1Case } = await vite.ssrLoadModule("/src/test/fixtures/phase1.ts");
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT null::uuid $$;
    CREATE SCHEMA storage; CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(), bucket_id text, name text);
    CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array($1,'/') $$;`);
  const journal = JSON.parse(await sql("drizzle/migrations/meta/_journal.json")).entries;
  for (const e of journal.slice(0, 12)) await db.exec(await sql(`drizzle/migrations/${e.tag}.sql`));
  const catalog = async () => ({
    seed: (
      await db.query(
        `SELECT oid, md5(prosrc) hash, prosecdef, proconfig, proowner, proacl, prorettype, prolang FROM pg_proc WHERE oid='public.handle_new_user()'::regprocedure`,
      )
    ).rows[0],
    triggers: (
      await db.query(
        `SELECT tgname, tgenabled, tgfoid, pg_get_triggerdef(oid) definition FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgname`,
      )
    ).rows,
    constraints: (
      await db.query(
        `SELECT conname, pg_get_constraintdef(oid) definition FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY conname`,
      )
    ).rows,
    policies: (
      await db.query(`SELECT * FROM pg_policies ORDER BY schemaname, tablename, policyname`)
    ).rows,
  });
  await db.exec(await sql("scripts/phase1-seed-compatibility-inspection.sql"));
  checks.push("Read-only seed/dependency inspection SQL executes locally");
  const beforeCatalog = await catalog();
  check("Repository seed matches migration guard", () =>
    assert.equal(beforeCatalog.seed.hash, "9bc90882dbbe580fe2f2a21b9bc46ba1"),
  );
  const seed = async () => {
    const user = (
      await db.query(
        `INSERT INTO auth.users(email) VALUES ('rehearsal@example.invalid') RETURNING id`,
      )
    ).rows[0].id;
    return (await db.query("SELECT * FROM public.scenario_assumptions WHERE created_by=$1", [user]))
      .rows[0];
  };
  const initialSeed = await seed();
  const insert = async (a) =>
    (
      await db.query(
        `INSERT INTO public.scenario_assumptions(organization_id,scenario_id,version,assumptions,created_by)
    SELECT $1,$2,coalesce(max(version),0)+1,$3::jsonb,$4 FROM public.scenario_assumptions WHERE scenario_id=$2 RETURNING *`,
        [
          initialSeed.organization_id,
          initialSeed.scenario_id,
          JSON.stringify(a),
          initialSeed.created_by,
        ],
      )
    ).rows[0];
  const legacy = phase1Case({
    fbRevenueYear1: 100,
    fbOpexYear1: 100,
    ancillaryGrowth: [0.1],
    costInflation: 0.025,
    volumeMethods: { fb: { opex: { method: "legacy" } } },
  });
  const cases = [
    legacy,
    { ...legacy, opexGrowth: { fb: [] } },
    { ...legacy, opexGrowth: { cable: [0.03] } },
    { ...legacy, opexGrowth: { fb: [0.04, 0.03] } },
    { ...legacy, fbFollowsPassengers: true },
    { ...legacy, fbBenchmark: { adjust: true, opex: { assetId: "isolated", year: 2025 } } },
  ];
  await db.exec("ALTER TABLE public.scenario_assumptions DISABLE TRIGGER default_fb_opex_growth");
  for (const a of cases) await insert(a); // Historical fixtures include legacy pre-trigger versions.
  await db.exec("ALTER TABLE public.scenario_assumptions ENABLE TRIGGER default_fb_opex_growth");
  const defect = await insert(legacy);
  check("Original save-time defect reproduced", () => {
    assert.deepEqual(defect.assumptions.opexGrowth.fb, [0.025, 0.025, 0.025]);
    assert.ok(Math.abs(oldCalculate(legacy).rows[1].fbOpex - 112.75) < 1e-9);
    assert.ok(Math.abs(oldCalculate(defect.assumptions).rows[1].fbOpex - 102.5) < 1e-9);
  });
  const migration = await sql("drizzle/migrations/0012_preserve_saved_fb_opex_growth.sql");
  const rollback = await sql("docs/sql/phase1-fb-opex-rollback.sql");
  const history = await snapshot();
  await db.exec("BEGIN");
  await db.exec(
    `CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;`,
  );
  await assert.rejects(db.exec(migration), /unrecognized new-user seed function/);
  await db.exec("ROLLBACK");
  checks.push("Unknown seed body rejected before trigger removal");
  await db.exec(
    "BEGIN; DROP TRIGGER on_auth_user_created ON auth.users; DROP FUNCTION public.handle_new_user();",
  );
  await assert.rejects(db.exec(migration), /does not exist/);
  await db.exec("ROLLBACK");
  checks.push("Missing seed function fails closed");
  await db.exec("BEGIN");
  await db.exec(migration);
  await db.exec("COMMIT");
  const afterCatalog = await catalog();
  assert.deepEqual(await snapshot(), history);
  checks.push("Apply preserves historical rows exactly");
  check("Function OID, owner, ACL, security definer, search path and signature preserved", () => {
    const { hash: ignoredBefore, ...b } = beforeCatalog.seed;
    const { hash: ignoredAfter, ...a } = afterCatalog.seed;
    assert.deepEqual(a, b);
  });
  check("Only intended default trigger removed; auth and tenant guards retained", () =>
    assert.deepEqual(
      afterCatalog.triggers,
      beforeCatalog.triggers.filter((t) => t.tgname !== "default_fb_opex_growth"),
    ),
  );
  check("RLS policies and constraints unchanged", () => {
    assert.deepEqual(afterCatalog.policies, beforeCatalog.policies);
    assert.deepEqual(afterCatalog.constraints, beforeCatalog.constraints);
  });
  for (const a of cases) {
    const saved = (await insert(a)).assumptions;
    assert.deepEqual(saved, a);
    assert.deepEqual(calculate(saved), calculate(a));
    assert.deepEqual(oldCalculate(saved), oldCalculate(a));
  }
  checks.push(
    "Six exact JSON/full financial-output round trips on Phase 1 and main reference engines",
  );
  for (const row of history) {
    const after = (
      await db.query("SELECT assumptions FROM public.scenario_assumptions WHERE id=$1", [row.id])
    ).rows[0].assumptions;
    assert.deepEqual(oldCalculate(after), oldCalculate(row.assumptions));
    assert.deepEqual(calculate(after), calculate(row.assumptions));
  }
  checks.push("Historical financial outputs unchanged within each engine");
  const updatedSeed = await seed();
  assert.deepEqual(updatedSeed.assumptions, initialSeed.assumptions);
  assert.deepEqual(oldCalculate(updatedSeed.assumptions), oldCalculate(initialSeed.assumptions));
  assert.deepEqual(calculate(updatedSeed.assumptions), calculate(initialSeed.assumptions));
  checks.push("Full-schema signup succeeds with unchanged seed assumptions and outputs");
  await db.exec("BEGIN");
  await assert.rejects(db.exec(migration), /unrecognized new-user seed function/);
  await db.exec("ROLLBACK");
  checks.push("Raw migration reapplication fails closed (runner must use ledger)");
  const beforeRollback = await snapshot();
  await db.exec(rollback);
  assert.deepEqual(await snapshot(), beforeRollback);
  checks.push("Rollback preserves every historical and newly saved row exactly");
  assert.deepEqual(await catalog(), beforeCatalog);
  checks.push(
    "Rollback restores seed metadata, trigger definitions, policies and constraints exactly",
  );
  assert.deepEqual((await insert(legacy)).assumptions.opexGrowth.fb, [0.025, 0.025, 0.025]);
  assert.deepEqual((await seed()).assumptions, initialSeed.assumptions);
  checks.push("Rollback restores original save transformation and signup defaults");
  await db.exec("BEGIN");
  await db.exec(migration);
  await db.exec("COMMIT");
  checks.push("Apply after rollback succeeds with original guard restored");
  const report = {
    environment: (await db.query("SELECT version()")).rows[0].version,
    isolation:
      "In-memory PGlite PostgreSQL; no network or production data; auth/storage stubs; privileged schema owner",
    baseline_ref: baseline,
    passed: checks.length,
    checks,
    historical_rows: history.length,
    historical_snapshot_sha256: fingerprint(history),
    before_rollback_rows: beforeRollback.length,
    original_seed_body_md5: beforeCatalog.seed.hash,
    updated_seed_body_md5: afterCatalog.seed.hash,
    caveats: [
      "Production seed definition/hash not supplied; ledger matching is indirect evidence only",
      "Published application artifact SHA not supplied; main reference is a proxy",
      "No managed auth/storage service or production role/permission parity; not a production restore rehearsal",
    ],
  };
  await writeFile(
    "docs/phase1-release-rehearsal-results.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await vite.close();
  await db.close();
}
