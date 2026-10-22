// Disposable in-memory PostgreSQL only. No connection URL or production access.
// Supply an installed @electric-sql/pglite module path as argv[2] if not on the module path.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
const { PGlite } = await import(process.argv[2] ?? "@electric-sql/pglite");
const db = new PGlite();
const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false, ws: false },
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
});
try {
  const { calculate } = await vite.ssrLoadModule("/src/financialEngine.ts");
  const { phase1Case } = await vite.ssrLoadModule("/src/test/fixtures/phase1.ts");
  await db.exec(
    `CREATE TABLE public.scenario_assumptions (id serial PRIMARY KEY, assumptions jsonb NOT NULL,
      organization_id uuid, scenario_id uuid, version integer, note text, created_by uuid);
    CREATE TABLE public.organizations (id uuid DEFAULT gen_random_uuid(), name text);
    CREATE TABLE public.organization_members (organization_id uuid, user_id uuid, email text, role text);
    CREATE TABLE public.projects (id uuid DEFAULT gen_random_uuid(), organization_id uuid, name text,
      location text, description text, assumption_notes text, created_by uuid);
    CREATE TABLE public.scenarios (id uuid DEFAULT gen_random_uuid(), organization_id uuid,
      project_id uuid, name text, kind text);
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid DEFAULT gen_random_uuid(), email text);`,
  );
  const initialSchema = await readFile(
    new URL("../drizzle/migrations/0000_portfolio_schema.sql", import.meta.url),
    "utf8",
  );
  const seedFunction = initialSchema.match(
    /CREATE OR REPLACE FUNCTION public.handle_new_user\(\)[\s\S]*?END \$\$;/,
  )[0];
  await db.exec(seedFunction);
  await db.exec(
    "CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();",
  );
  await db.exec(
    await readFile(
      new URL("../drizzle/migrations/0007_default_independent_fb_opex_growth.sql", import.meta.url),
      "utf8",
    ),
  );
  const legacy = phase1Case({
    fbRevenueYear1: 100,
    fbOpexYear1: 100,
    ancillaryGrowth: [0.1],
    costInflation: 0.025,
    volumeMethods: { fb: { opex: { method: "legacy" } } },
  });
  const insert = async (a) =>
    (
      await db.query(
        "INSERT INTO public.scenario_assumptions(assumptions) VALUES ($1::jsonb) RETURNING assumptions",
        [JSON.stringify(a)],
      )
    ).rows[0].assumptions;
  const old = await insert(legacy);
  const seed = async () => {
    await db.exec("INSERT INTO auth.users(email) VALUES ('disposable@example.invalid');");
    return (
      await db.query("SELECT assumptions FROM public.scenario_assumptions ORDER BY id DESC LIMIT 1")
    ).rows[0].assumptions;
  };
  const originalSeed = await seed();
  await db.exec(
    await readFile(new URL("./phase1-fb-opex-inspection.sql", import.meta.url), "utf8"),
  );
  assert.deepEqual(old.opexGrowth.fb, [0.025, 0.025, 0.025]);
  assert.ok(Math.abs(calculate(legacy).rows[1].fbOpex - 112.75) < 1e-10);
  assert.ok(Math.abs(calculate(old).rows[1].fbOpex - 102.5) < 1e-10);
  console.log(
    "BEFORE: legacy Year 2 F&B OPEX 112.75 becomes 102.50 on reload; trigger injects growth.",
  );
  if (!process.argv.includes("--baseline")) {
    const migration = await readFile(
      new URL("../drizzle/migrations/0012_preserve_saved_fb_opex_growth.sql", import.meta.url),
      "utf8",
    );
    await db.exec(
      "BEGIN; CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;",
    );
    await assert.rejects(db.exec(migration), /unrecognized new-user seed function/);
    await db.exec("ROLLBACK;");
    const historical = (await db.query("SELECT * FROM public.scenario_assumptions ORDER BY id"))
      .rows;
    await db.exec("BEGIN;");
    await db.exec(
      await readFile(
        new URL("../drizzle/migrations/0012_preserve_saved_fb_opex_growth.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.exec("COMMIT;");
    assert.deepEqual(
      (await db.query("SELECT * FROM public.scenario_assumptions ORDER BY id")).rows,
      historical,
    );
    const cases = [
      legacy,
      { ...legacy, opexGrowth: { fb: [] } },
      { ...legacy, opexGrowth: { cable: [0.03] } },
      { ...legacy, opexGrowth: { fb: [0.04, 0.03] } },
      { ...legacy, fbFollowsPassengers: true },
      { ...legacy, fbBenchmark: { adjust: true, opex: { assetId: "disposable", year: 2025 } } },
    ];
    for (const a of cases) {
      const reloaded = await insert(a);
      assert.deepEqual(reloaded, a);
      assert.deepEqual(calculate(reloaded), calculate(a));
    }
    assert.deepEqual(await seed(), originalSeed);
    assert.deepEqual(calculate(await seed()), calculate(originalSeed));
    const beforeRollback = (await db.query("SELECT * FROM public.scenario_assumptions ORDER BY id"))
      .rows;
    await db.exec(
      await readFile(new URL("../docs/sql/phase1-fb-opex-rollback.sql", import.meta.url), "utf8"),
    );
    assert.deepEqual(
      (await db.query("SELECT * FROM public.scenario_assumptions ORDER BY id")).rows,
      beforeRollback,
    );
    assert.deepEqual((await insert(legacy)).opexGrowth.fb, [0.025, 0.025, 0.025]);
    assert.deepEqual(await seed(), originalSeed);
    console.log(
      "AFTER: 6 exact JSON and financial round trips pass; new-user seed unchanged; historical rows unchanged; rollback restores original behaviour without rewriting rows.",
    );
  }
} finally {
  await vite.close();
  await db.close();
}
