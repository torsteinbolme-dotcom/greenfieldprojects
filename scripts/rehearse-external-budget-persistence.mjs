// Disposable PostgreSQL/WASM only. No connection URL, production client or credentials.
// node scripts/rehearse-external-budget-persistence.mjs /absolute/path/to/pglite/dist/index.js
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";
if (process.versions.node !== "24.19.0") throw Error("Rehearsal requires Node 24.19.0");
const modulePath = process.argv[2];
if (!modulePath || !path.isAbsolute(modulePath) || !existsSync(modulePath))
  throw Error("Supply a local PGlite module path; network database URLs are prohibited.");
const { PGlite } = await import(pathToFileURL(modulePath).href);
const db = new PGlite();
const require = createRequire(import.meta.url);
const root = process.cwd();
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const localRequire = (spec) => {
    if (!spec.startsWith(".") && !spec.startsWith("@/")) return require(spec);
    const base = spec.startsWith("@/")
      ? path.join(root, "src", spec.slice(2))
      : path.resolve(path.dirname(file), spec);
    const target = ["", ".ts", ".tsx", "/index.ts"]
      .map((s) => base + s)
      .find((p) => existsSync(p) && statSync(p).isFile());
    if (!target) throw Error(`Missing module ${spec}`);
    return load(target);
  };
  new Function("require", "module", "exports", code)(localRequire, module, module.exports);
  return module.exports;
}
const { executeBudgetCommand } = load("src/lib/external-budget-persistence.ts");
const { calculateExternalBudget } = load("src/lib/financial-input.ts");
const { phase1Case } = load("src/test/fixtures/phase1.ts");
const sql = (file) => readFileSync(file, "utf8");
const checks = [];
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1),
  viewer = id(2),
  outsider = id(3),
  adminActor = id(4);
const org = id(10),
  otherOrg = id(11),
  project = id(20),
  otherProject = id(21),
  sameOrgProject = id(22);
const scenario = id(30),
  sourceId = id(40),
  source2 = id(41),
  foreignSource = id(42),
  foreignScenario = id(31);
async function roleQuery(role, user, query, params = []) {
  return db.transaction(async (tx) => {
    await tx.exec(`SET LOCAL ROLE ${role}`);
    await tx.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [user ?? ""]);
    return tx.query(query, params);
  });
}
const rows = async (role, user, table) =>
  (await roleQuery(role, user, `SELECT * FROM public.${table} ORDER BY id`)).rows;
async function denied(name, fn, code) {
  await assert.rejects(fn, (e) => !code || e.code === code);
  checks.push(name);
}
async function check(name, fn) {
  await fn();
  checks.push(name);
}
const beforeExisting = async () =>
  (
    await db.query(
      "SELECT jsonb_agg(to_jsonb(a) ORDER BY id) AS value FROM public.scenario_assumptions a",
    )
  ).rows[0].value;
function storeFor(user) {
  return {
    async readCurrent(projectId, budgetId) {
      const r = await roleQuery(
        "authenticated",
        user,
        `SELECT v.* FROM public.external_budget b JOIN public.external_budget_versions v ON v.id=b.current_version_id WHERE b.id=$1 AND b.project_id=$2`,
        [budgetId, projectId],
      );
      if (!r.rows[0]) throw Error("Not authorized");
      return r.rows[0];
    },
    async readSource(projectId, selected) {
      const r = await roleQuery(
        "authenticated",
        user,
        `SELECT a.* FROM public.scenario_assumptions a JOIN public.scenarios s ON s.id=a.scenario_id WHERE a.id=$1 AND s.id=$2 AND s.project_id=$3 AND a.organization_id=s.organization_id`,
        [selected.assumptionId, selected.scenarioId, projectId],
      );
      const a = r.rows[0];
      if (!a) throw Error("Not authorized source");
      return {
        id: a.id,
        scenarioId: a.scenario_id,
        version: a.version,
        calculationVersion: a.calculation_version,
        assumptions: a.assumptions,
      };
    },
    async commit(w) {
      const r = await roleQuery(
        "service_role",
        null,
        `SELECT public.write_external_budget($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb) AS value`,
        [
          w.actor,
          w.operation,
          w.project,
          w.budget,
          w.expected,
          w.payload === null ? null : JSON.stringify(w.payload),
          w.capture === null ? null : JSON.stringify(w.capture),
        ],
      );
      return r.rows[0].value;
    },
  };
}
const draft = (name) => ({
  name,
  description: null,
  sourceInfo: { notes: "Local synthetic fixture" },
  input: { version: "financial-input-v1", mode: "externalBudget", status: "draft" },
});
const complete = (name) => ({
  ...draft(name),
  input: {
    version: "financial-input-v1",
    mode: "externalBudget",
    status: "complete",
    initialCapex: 1000,
    annual: Array.from({ length: 10 }, (_, i) => ({
      year: i + 1,
      passengers: 100,
      ticketNetPrice: 3,
      fbRevenue: 0,
      fbOpex: 0,
      cableOpex: 100,
    })),
    accounting: {
      ticketAlreadyNet: true,
      cableExcludesSeparateCosts: true,
      opexExcludesFinancingTaxDepreciation: true,
      replacementCapexNotDoubleCounted: true,
      capexIncludesContingency: true,
    },
  },
});
const sourceSelection = { scenarioId: scenario, assumptionId: sourceId };
const run = (user, command) => executeBudgetCommand(storeFor(user), user, command);
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text,raw_user_meta_data jsonb DEFAULT '{}'::jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
    CREATE SCHEMA storage; CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text);
    CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array($1,'/') $$;`);
  const journal = JSON.parse(sql("drizzle/migrations/meta/_journal.json")).entries;
  for (const e of journal.filter((e) => e.idx < 14))
    await db.exec(sql(`drizzle/migrations/${e.tag}.sql`));
  await db.query("INSERT INTO public.organizations(id,name) VALUES($1,'A'),($2,'B')", [
    org,
    otherOrg,
  ]);
  await db.query(
    "INSERT INTO public.organization_members(organization_id,user_id,role) VALUES($1,$2,'editor'),($1,$3,'viewer'),($4,$5,'admin'),($1,$6,'admin')",
    [org, actor, viewer, otherOrg, outsider, adminActor],
  );
  await db.query(
    "INSERT INTO public.projects(id,organization_id,name) VALUES($1,$2,'A'),($3,$4,'B'),($5,$2,'A2')",
    [project, org, otherProject, otherOrg, sameOrgProject],
  );
  await db.query(
    "INSERT INTO public.scenarios(id,project_id,organization_id,name) VALUES($1,$2,$3,'source'),($4,$5,$6,'foreign')",
    [scenario, project, org, foreignScenario, otherProject, otherOrg],
  );
  const assumptions = phase1Case();
  await db.query(
    "INSERT INTO public.scenario_assumptions(id,scenario_id,organization_id,version,assumptions,calculation_version) VALUES($1,$2,$3,1,$4::jsonb,'mountain-v5-volume'),($5,$2,$3,2,$6::jsonb,'mountain-v5-volume'),($7,$8,$9,1,$4::jsonb,'mountain-v5-volume')",
    [
      sourceId,
      scenario,
      org,
      JSON.stringify(assumptions),
      source2,
      JSON.stringify({ ...assumptions, interestRate: 0.05 }),
      foreignSource,
      foreignScenario,
      otherOrg,
    ],
  );
  const original = await beforeExisting();
  await db.transaction((tx) =>
    tx.exec(sql("drizzle/migrations/0014_external_budget_persistence.sql")),
  );
  await check("migration preserves existing assumption rows exactly", async () =>
    assert.deepEqual(await beforeExisting(), original),
  );
  await check("existing scenario readers and editors still work", async () => {
    assert.equal(
      (await roleQuery("authenticated", viewer, "SELECT id FROM public.scenario_assumptions")).rows
        .length,
      2,
    );
    await roleQuery(
      "authenticated",
      actor,
      "UPDATE public.projects SET description='unchanged API compatible' WHERE id=$1",
      [project],
    );
  });
  let b = await run(actor, { operation: "create", projectId: project, document: draft("Draft") });
  await check("incomplete draft saved without financial inference", async () =>
    assert.deepEqual(b.version.input, draft("Draft").input),
  );
  const draftVersion = b.version;
  await denied("restore requires an archived budget", () =>
    run(actor, {
      operation: "restore",
      projectId: project,
      budgetId: b.budget.id,
      expectedVersionId: b.version.id,
    }),
  );
  b = await run(actor, {
    operation: "refresh",
    projectId: project,
    budgetId: b.budget.id,
    expectedVersionId: b.version.id,
    source: sourceSelection,
    document: complete("Budget"),
  });
  await check(
    "completion uses actual pinned source and independent financial outputs",
    async () => {
      assert.equal(b.version.source_assumption_id, sourceId);
      assert.equal(b.version.version, 2);
      const r = calculateExternalBudget(b.version.input).result;
      assert.equal(r.rows[2].ebitda, 200);
      assert.equal(r.equityMultiple, 3.576);
    },
  );
  const completeVersion = b.version;
  await check(
    "privileged RPC has a fixed search path and security-definer configuration",
    async () => {
      const meta = (
        await db.query(
          "SELECT prosecdef,proconfig FROM pg_proc WHERE oid='public.write_external_budget(uuid,text,uuid,uuid,uuid,jsonb,jsonb)'::regprocedure",
        )
      ).rows[0];
      assert.equal(meta.prosecdef, true);
      assert.ok(meta.proconfig.includes("search_path=pg_catalog, public, pg_temp"));
    },
  );
  await denied(
    "database prevents inheritance edits during ordinary save",
    () =>
      storeFor(actor).commit({
        actor,
        operation: "save",
        project,
        budget: b.budget.id,
        expected: b.version.id,
        payload: {
          ...complete("forged inheritance"),
          input: {
            ...b.version.input,
            inheritance: { ...b.version.input.inheritance, interestRate: 0 },
          },
        },
        capture: null,
      }),
    "23514",
  );
  await denied(
    "database prevents duplicate into a different project",
    () =>
      storeFor(actor).commit({
        actor,
        operation: "duplicate",
        project: sameOrgProject,
        budget: b.budget.id,
        expected: b.version.id,
        payload: { name: "forged copy" },
        capture: null,
      }),
    "42501",
  );
  await denied("database refuses unverified inheritance on a new draft", () =>
    storeFor(actor).commit({
      actor,
      operation: "create",
      project,
      budget: null,
      expected: null,
      payload: {
        ...draft("forged draft"),
        input: { ...draft("x").input, inheritance: b.version.input.inheritance },
      },
      capture: null,
    }),
  );

  await denied(
    "viewer write denied by database",
    () =>
      run(viewer, {
        operation: "save",
        projectId: project,
        budgetId: b.budget.id,
        expectedVersionId: b.version.id,
        document: complete("forbidden"),
      }),
    "42501",
  );
  await check("cross-organization read hidden by RLS", async () =>
    assert.equal((await rows("authenticated", outsider, "external_budget")).length, 0),
  );
  await denied(
    "cross-organization create denied",
    () => run(outsider, { operation: "create", projectId: project, document: draft("foreign") }),
    "42501",
  );
  await denied("cross-organization source reference denied", () =>
    run(actor, {
      operation: "create",
      projectId: project,
      source: { scenarioId: foreignScenario, assumptionId: foreignSource },
      document: complete("forged"),
    }),
  );
  await denied("forged scenario/version pairing denied", () =>
    run(actor, {
      operation: "create",
      projectId: project,
      source: { scenarioId: foreignScenario, assumptionId: sourceId },
      document: complete("forged"),
    }),
  );
  await denied("same-organization cross-project duplication denied", () =>
    run(actor, {
      operation: "duplicate",
      projectId: sameOrgProject,
      budgetId: b.budget.id,
      expectedVersionId: b.version.id,
      name: "bad",
    }),
  );
  await check("cross-organization version reads hidden", async () =>
    assert.equal((await rows("authenticated", outsider, "external_budget_versions")).length, 0),
  );
  const captured = {
    id: sourceId,
    scenarioId: scenario,
    version: 1,
    calculationVersion: "mountain-v5-volume",
    assumptions,
  };
  const direct = (capture, projectId = project) =>
    storeFor(actor).commit({
      actor,
      operation: "create",
      project: projectId,
      budget: null,
      expected: null,
      payload: { ...complete("direct proof"), input: b.version.input },
      capture,
    });
  await denied(
    "database rejects cross-organization source capture",
    () => direct({ ...captured, id: foreignSource, scenarioId: foreignScenario }),
    "23514",
  );
  await denied(
    "database rejects same-organization wrong-project capture",
    () => direct(captured, sameOrgProject),
    "23514",
  );
  await denied(
    "database rejects forged source identity pairing",
    () => direct({ ...captured, scenarioId: foreignScenario }),
    "23514",
  );
  await denied(
    "database rejects stale or forged source assumptions",
    () => direct({ ...captured, assumptions: { ...assumptions, interestRate: 0.9 } }),
    "23514",
  );
  await denied(
    "database rejects forged original version number",
    () => direct({ ...captured, version: 2 }),
    "23514",
  );
  await check("viewer reads current and historical budget data", async () => {
    assert.equal((await rows("authenticated", viewer, "external_budget")).length, 1);
    assert.equal((await rows("authenticated", viewer, "external_budget_versions")).length, 2);
  });
  await check("authenticated role without an identity cannot read", async () =>
    assert.equal((await rows("authenticated", null, "external_budget")).length, 0),
  );
  await denied(
    "database rejects a null actor even for privileged transport",
    () =>
      storeFor(actor).commit({
        actor: null,
        operation: "create",
        project,
        budget: null,
        expected: null,
        payload: draft("no actor"),
        capture: null,
      }),
    "22023",
  );
  for (const role of ["authenticated", "anon"]) {
    await denied(
      `${role} cannot call privileged RPC directly`,
      () =>
        roleQuery(
          role,
          actor,
          "SELECT public.write_external_budget($1,'create',$2,NULL,NULL,$3::jsonb,NULL)",
          [actor, project, JSON.stringify(draft("bypass"))],
        ),
      "42501",
    );
    for (const table of ["external_budget", "external_budget_versions"])
      for (const action of ["UPDATE", "DELETE"]) {
        await denied(
          `${role} cannot ${action} ${table}`,
          () =>
            roleQuery(
              role,
              actor,
              action === "UPDATE"
                ? `UPDATE public.${table} SET created_by=$1`
                : `DELETE FROM public.${table} WHERE created_by=$1`,
              [actor],
            ),
          "42501",
        );
      }
  }
  await denied("anonymous read denied", () => rows("anon", null, "external_budget"), "42501");
  await denied("anonymous command rejected", () =>
    run("", { operation: "create", projectId: project, document: draft("anonymous") }),
  );
  for (const role of ["authenticated", "anon", "service_role"]) {
    await denied(
      `${role} direct header INSERT denied`,
      () =>
        roleQuery(
          role,
          actor,
          "INSERT INTO public.external_budget(id,organization_id,project_id,current_version_id,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$5)",
          [id(90), org, project, id(91), actor],
        ),
      "42501",
    );
    await denied(
      `${role} direct version INSERT denied`,
      () => roleQuery(role, actor, "INSERT INTO public.external_budget_versions DEFAULT VALUES"),
      "42501",
    );
  }
  await denied(
    "history UPDATE trigger rejects even privileged edits",
    () =>
      db.query("UPDATE public.external_budget_versions SET name='rewrite' WHERE id=$1", [
        completeVersion.id,
      ]),
    "23514",
  );
  await denied(
    "history DELETE trigger rejects even privileged edits",
    () => db.query("DELETE FROM public.external_budget_versions WHERE id=$1", [completeVersion.id]),
    "23514",
  );
  await denied(
    "ownership reassignment trigger rejects privileged changes",
    () =>
      db.query("UPDATE public.external_budget SET project_id=$1 WHERE id=$2", [
        sameOrgProject,
        b.budget.id,
      ]),
    "23514",
  );
  await denied("invalid completion blocked before database commit", () =>
    run(actor, {
      operation: "save",
      projectId: project,
      budgetId: b.budget.id,
      expectedVersionId: b.version.id,
      document: { ...complete("invalid"), input: { ...complete("x").input, annual: [] } },
    }),
  );
  await denied("forged inheritance payload rejected by request schema", () =>
    run(actor, {
      operation: "save",
      projectId: project,
      budgetId: b.budget.id,
      expectedVersionId: b.version.id,
      document: { ...complete("forged"), input: { ...complete("x").input, inheritance: {} } },
    }),
  );
  b = await run(actor, {
    operation: "save",
    projectId: project,
    budgetId: b.budget.id,
    expectedVersionId: b.version.id,
    document: complete("Saved"),
  });
  await denied("stale current-version command conflicts explicitly", () =>
    run(actor, {
      operation: "save",
      projectId: project,
      budgetId: b.budget.id,
      expectedVersionId: completeVersion.id,
      document: complete("stale"),
    }),
  );
  await denied(
    "database independently enforces CAS",
    () =>
      storeFor(actor).commit({
        actor,
        operation: "save",
        project,
        budget: b.budget.id,
        expected: completeVersion.id,
        payload: { ...complete("stale"), input: b.version.input },
        capture: null,
      }),
    "40001",
  );
  const copy = await run(actor, {
    operation: "duplicate",
    projectId: project,
    budgetId: b.budget.id,
    expectedVersionId: b.version.id,
    name: "Copy",
  });
  await check("same-project duplicate pins provenance and inputs", async () => {
    assert.notEqual(copy.budget.id, b.budget.id);
    assert.equal(copy.version.version, 1);
    assert.equal(copy.version.duplicated_from_version_id, b.version.id);
    assert.deepEqual(copy.version.input, b.version.input);
  });
  await denied(
    "current-version FK cannot point into another budget",
    () =>
      db.query("UPDATE public.external_budget SET current_version_id=$1 WHERE id=$2", [
        copy.version.id,
        b.budget.id,
      ]),
    "23503",
  );
  await denied(
    "project hard delete cannot cascade away immutable budget history",
    () => roleQuery("authenticated", actor, "DELETE FROM public.projects WHERE id=$1", [project]),
    "23001",
  );
  await roleQuery(
    "authenticated",
    actor,
    "INSERT INTO public.scenario_assumptions(id,scenario_id,organization_id,version,assumptions,calculation_version) VALUES($1,$2,$3,3,$4::jsonb,'mountain-v5-volume')",
    [id(44), scenario, org, JSON.stringify({ ...assumptions, interestRate: 0.2 })],
  );
  await check(
    "existing scenario append remains compatible and cannot refresh pinned budgets implicitly",
    async () => {
      const unchanged = await storeFor(actor).readCurrent(project, b.budget.id);
      assert.equal(unchanged.source_assumption_id, sourceId);
      assert.equal(unchanged.input.inheritance.interestRate, 0.1);
    },
  );
  const previousSnapshot = structuredClone(b.version.input.inheritance);
  const beforeRefresh = b.version;
  b = await run(actor, {
    operation: "refresh",
    projectId: project,
    budgetId: b.budget.id,
    expectedVersionId: b.version.id,
    source: { scenarioId: scenario, assumptionId: source2 },
    document: complete("Refreshed"),
  });
  await check(
    "explicit refresh appends new source and leaves historical snapshot unchanged",
    async () => {
      assert.equal(b.version.source_assumption_id, source2);
      assert.equal(b.version.input.inheritance.interestRate, 0.05);
      const old = (
        await db.query("SELECT input FROM public.external_budget_versions WHERE id=$1", [
          beforeRefresh.id,
        ])
      ).rows[0];
      assert.deepEqual(old.input.inheritance, previousSnapshot);
    },
  );
  b = await run(actor, {
    operation: "archive",
    projectId: project,
    budgetId: b.budget.id,
    expectedVersionId: b.version.id,
  });
  await check("archive advances version and retains history", async () => {
    assert.ok(b.budget.archived_at);
    assert.equal(b.version.action, "archive");
  });
  await denied("archived budget refuses saves", () =>
    run(actor, {
      operation: "save",
      projectId: project,
      budgetId: b.budget.id,
      expectedVersionId: b.version.id,
      document: complete("bad"),
    }),
  );
  b = await run(adminActor, {
    operation: "restore",
    projectId: project,
    budgetId: b.budget.id,
    expectedVersionId: b.version.id,
  });
  await check("admin restore advances version without deleting history", async () =>
    assert.equal(b.budget.archived_at, null),
  );
  const beforeDelete = calculateExternalBudget(b.version.input);
  await roleQuery("authenticated", actor, "DELETE FROM public.scenarios WHERE id=$1", [scenario]);
  await check(
    "source deletion preserves immutable historical identity and reproducibility",
    async () => {
      const stored = await storeFor(actor).readCurrent(project, b.budget.id);
      assert.equal(stored.source_assumption_id, source2);
      assert.deepEqual(calculateExternalBudget(stored.input), beforeDelete);
      assert.deepEqual(
        (
          await db.query("SELECT input FROM public.external_budget_versions WHERE id=$1", [
            draftVersion.id,
          ])
        ).rows[0].input,
        draftVersion.input,
      );
    },
  );
  b = await run(actor, {
    operation: "save",
    projectId: project,
    budgetId: b.budget.id,
    expectedVersionId: b.version.id,
    document: complete("After source deletion"),
  });
  await denied("refresh deleted source fails rather than inventing inheritance", () =>
    run(actor, {
      operation: "refresh",
      projectId: project,
      budgetId: b.budget.id,
      expectedVersionId: b.version.id,
      source: sourceSelection,
      document: complete("bad"),
    }),
  );
  const counts = await db.query(
    "SELECT (SELECT count(*) FROM public.external_budget) AS budgets,(SELECT count(*) FROM public.external_budget_versions) AS versions",
  );
  await denied("failed version INSERT rolls back new header atomically", () =>
    storeFor(actor).commit({
      actor,
      operation: "create",
      project,
      budget: null,
      expected: null,
      payload: { name: "", description: null, sourceInfo: {}, input: draft("x").input },
      capture: null,
    }),
  );
  await check("failed transaction leaves no orphan header/version", async () =>
    assert.deepEqual(
      (
        await db.query(
          "SELECT (SELECT count(*) FROM public.external_budget) AS budgets,(SELECT count(*) FROM public.external_budget_versions) AS versions",
        )
      ).rows,
      counts.rows,
    ),
  );
  await roleQuery("authenticated", actor, "SELECT public.soft_delete_project($1)", [project]);
  await check("existing soft-delete operation hides external budgets via RLS", async () =>
    assert.equal((await rows("authenticated", actor, "external_budget")).length, 0),
  );
  await db.query("UPDATE public.projects SET deleted_at=NULL,deleted_by=NULL WHERE id=$1", [
    project,
  ]);
  await check("project restoration retains history and visibility", async () =>
    assert.equal((await rows("authenticated", actor, "external_budget")).length, 2),
  );
  await db.exec(sql("scripts/sql/phase2b-disable-external-budget-writes.sql"));
  await denied(
    "recovery disables writes without dropping history",
    () =>
      run(actor, {
        operation: "archive",
        projectId: project,
        budgetId: b.budget.id,
        expectedVersionId: b.version.id,
      }),
    "42501",
  );
  await check("recovery preserves member read access and every version", async () =>
    assert.deepEqual(
      (await db.query("SELECT id,input FROM public.external_budget_versions ORDER BY id")).rows
        .length,
      Number(counts.rows[0].versions),
    ),
  );
  console.log(
    JSON.stringify(
      {
        node: process.versions.node,
        migrationSha256: createHash("sha256")
          .update(sql("drizzle/migrations/0014_external_budget_persistence.sql"))
          .digest("hex"),
        recoverySha256: createHash("sha256")
          .update(sql("scripts/sql/phase2b-disable-external-budget-writes.sql"))
          .digest("hex"),
        environment: (await db.query("SELECT version() AS version")).rows[0].version,
        isolation:
          "In-memory PostgreSQL/WASM; synthetic auth claims/storage; no network or production data",
        passed: checks.length,
        checks,
        limitations: [
          "No managed Supabase JWT/PostgREST integration or production role parity",
          "No independent native PostgreSQL sessions/lock-contention test",
          "Recovery rehearses write disablement, not backup restoration",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await db.close();
}
