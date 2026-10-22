// Local Git sources + isolated PostgreSQL only; never accepts a connection URL.
// node scripts/test-phase1-historical-clients.mjs /absolute/path/to/pglite/dist/index.js
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
const { PGlite } = await import(process.argv[2]);
const git = process.env.PHASE1_GIT ?? "git";
const main = "5ca84c7042dabb18276c920d31cf193e5480e257";
const run = (...args) =>
  execFileSync(git, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const hash = (s) => createHash("sha256").update(s).digest("hex");
const source = (ref, p) => run("show", `${ref}:${p}`);
const functions = (s) => {
  const tree = ts.createSourceFile("source.ts", s, ts.ScriptTarget.Latest, true);
  return Object.fromEntries(
    tree.statements
      .filter(ts.isFunctionDeclaration)
      .filter((n) => n.name)
      .map((n) => [n.name.text, n.getText(tree)]),
  );
};
const revisions = (p) => [
  ...new Set([
    ...run("log", "--reverse", "--format=%H", main, "--", p).trim().split("\n").filter(Boolean),
    main,
  ]),
];
const unique = (p) => {
  const seen = new Set();
  return revisions(p).flatMap((ref) => {
    let text;
    try {
      text = source(ref, p);
    } catch {
      return [];
    }
    const sha256 = hash(text);
    if (seen.has(sha256)) return [];
    seen.add(sha256);
    return [{ ref, sha256, text }];
  });
};
const db = new PGlite();
let actingUser;
const clientCalls = [];
const quote = (name) => {
  assert.match(name, /^[a-z_]+$/);
  return '"' + name + '"';
};
function builder(table) {
  let cols = "*",
    insert,
    where = [],
    order,
    limit,
    one = false;
  const api = {
    select(value = "*") {
      cols = value;
      return api;
    },
    insert(value) {
      insert = value;
      return api;
    },
    eq(k, v) {
      where.push([k, v]);
      return api;
    },
    order(k, opts = {}) {
      order = [k, opts.ascending !== false];
      return api;
    },
    limit(n) {
      limit = n;
      return api;
    },
    maybeSingle() {
      one = true;
      return api;
    },
    single() {
      one = true;
      return api;
    },
    async then(resolve, reject) {
      try {
        let sql,
          params = [];
        if (insert) {
          const pairs = Object.entries(insert).filter(([, v]) => v !== undefined);
          sql = `INSERT INTO public.${quote(table)} (${pairs.map(([k]) => quote(k)).join(",")}) VALUES (${pairs
            .map(([, v], i) => {
              params.push(v !== null && typeof v === "object" ? JSON.stringify(v) : v);
              return "$" + (i + 1);
            })
            .join(",")}) RETURNING *`;
          clientCalls.push({ table, payload: structuredClone(insert) });
        } else {
          sql = `SELECT ${cols === "*" ? "*" : cols.split(",").map(quote).join(",")} FROM public.${quote(table)}`;
          if (where.length)
            sql +=
              " WHERE " +
              where
                .map(([k, v]) => {
                  params.push(v);
                  return `${quote(k)}=$${params.length}`;
                })
                .join(" AND ");
          if (order) sql += ` ORDER BY ${quote(order[0])} ${order[1] ? "ASC" : "DESC"}`;
          if (limit) sql += ` LIMIT ${Number(limit)}`;
        }
        const rows = (await db.query(sql, params)).rows;
        resolve({ data: one ? (rows[0] ?? null) : rows, error: null });
      } catch (e) {
        if (e.code) resolve({ data: null, error: { code: e.code, message: e.message } });
        else reject(e);
      }
    },
  };
  return api;
}
const supabase = {
  from: builder,
  auth: {
    getUser: async () => ({ data: { user: { id: actingUser } }, error: null }),
    getSession: async () => ({ data: { session: { user: { id: actingUser } } }, error: null }),
  },
};
function loader(ref) {
  const cache = new Map();
  const load = (p) => {
    if (cache.has(p)) return cache.get(p).exports;
    const mod = { exports: {} };
    cache.set(p, mod);
    if (p.endsWith(".json")) {
      mod.exports = { default: JSON.parse(source(ref, p)) };
      return mod.exports;
    }
    const code = ts.transpileModule(source(ref, p), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText;
    const require = (id) => {
      if (id === "@/integrations/supabase/client") return { supabase };
      if (id === "@tanstack/react-query")
        return {
          useQuery: () => {
            throw Error("Hooks are not browser-tested here");
          },
        };
      const base = id.startsWith("@/")
        ? "src/" + id.slice(2)
        : id.startsWith(".")
          ? path.posix.normalize(path.posix.join(path.posix.dirname(p), id))
          : null;
      assert.ok(base, `Unmodelled external import ${id}`);
      for (const target of [base, base + ".ts", base + ".tsx", base + "/index.ts"]) {
        try {
          source(ref, target);
        } catch {
          continue;
        }
        return load(target);
      }
      throw Error("Missing historical module " + base);
    };
    new Function("require", "module", "exports", code)(require, mod, mod.exports);
    return mod.exports;
  };
  return load;
}
const report = {
  baseline_ref: main,
  main_ancestry_commits: Number(run("rev-list", "--count", main)),
  shallow: run("rev-parse", "--is-shallow-repository").trim() === "true",
  environment: null,
  isolation:
    "In-memory PGlite; minimal auth/storage/invitation schema; historical save API adapter executes PostgreSQL under authenticated role; no production access",
  savers: [],
  engines: [],
  auth: [],
  models: [],
  checks: [],
};
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text,raw_user_meta_data jsonb DEFAULT '{}'::jsonb);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE SCHEMA storage; CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text);
 CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array($1,'/') $$;`);
  const journal = JSON.parse(
    await readFile("drizzle/migrations/meta/_journal.json", "utf8"),
  ).entries;
  for (const entry of journal.slice(0, 12))
    await db.exec(await readFile(`drizzle/migrations/${entry.tag}.sql`, "utf8"));
  await db.exec(
    `CREATE TABLE public.organization_invites(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),email text NOT NULL,token text NOT NULL UNIQUE,role public.org_role NOT NULL,accepted_at timestamptz,expires_at timestamptz NOT NULL);`,
  );
  await db.exec(await readFile("scripts/fixtures/phase1-production-seed.sql", "utf8"));
  actingUser = (
    await db.query(
      `INSERT INTO auth.users(email) VALUES ('historical@example.invalid') RETURNING id`,
    )
  ).rows[0].id;
  const seed = (
    await db.query("SELECT * FROM public.scenario_assumptions WHERE created_by=$1", [actingUser])
  ).rows[0];
  const before = (await db.query("SELECT * FROM public.scenario_assumptions ORDER BY id")).rows;
  const privileges = async () =>
    (
      await db.query(
        `SELECT table_name,grantee,privilege_type FROM information_schema.table_privileges WHERE table_schema='public' ORDER BY table_name,grantee,privilege_type`,
      )
    ).rows;
  const priorPrivileges = await privileges();
  await db.exec("BEGIN");
  await db.exec(
    await readFile("drizzle/migrations/0012_preserve_saved_fb_opex_growth.sql", "utf8"),
  );
  await db.exec("COMMIT");
  assert.deepEqual(await privileges(), priorPrivileges);
  report.checks.push("All public relation grants unchanged");
  assert.deepEqual(
    (await db.query("SELECT * FROM public.scenario_assumptions ORDER BY id")).rows,
    before,
  );
  report.checks.push("Historical assumptions unchanged by apply");
  const base = loader(main)("src/lib/model.ts").blankAssumptions("Historical compatibility");
  base.fbRevenueYear1 = 100;
  base.fbOpexYear1 = 100;
  base.ancillaryGrowth = [0.1];
  delete base.opexGrowth;
  const cases = [
    base,
    { ...base, opexGrowth: { fb: [] } },
    { ...base, opexGrowth: { fb: [0.04, 0.03] } },
    { ...base, fbFollowsPassengers: true },
    { ...base, fbBenchmark: { adjust: true, opex: { assetId: "fixture", year: 2025 } } },
  ];
  // Identical save source can import a newer calculation tag or ticket linker.
  // Cover composite dependency states, not only revisions of data.ts itself.
  const saverPaths = ["src/lib/data.ts", "src/lib/model.ts", "src/lib/ticket-pricing.ts"];
  const saveCandidates = new Set(saverPaths.flatMap(revisions));
  const saveHistory = [],
    seenSavers = new Set();
  for (const ref of saveCandidates) {
    let text;
    try {
      text = source(ref, "src/lib/data.ts");
    } catch {
      continue;
    }
    const dependencySignature = hash(
      saverPaths
        .map((p) => {
          try {
            return source(ref, p);
          } catch {
            return "absent";
          }
        })
        .join("\n"),
    );
    if (seenSavers.has(dependencySignature)) continue;
    seenSavers.add(dependencySignature);
    saveHistory.push({ ref, text, sha256: hash(text), dependency_sha256: dependencySignature });
  }
  const saveBodyHashes = new Set();
  for (const revision of saveHistory) {
    const load = loader(revision.ref),
      data = load("src/lib/data.ts"),
      model = load("src/lib/model.ts");
    saveBodyHashes.add(hash(functions(revision.text).saveAssumptionVersion));
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [actingUser]);
    await db.exec("SET ROLE authenticated");
    try {
      for (const a of cases) {
        const start = clientCalls.length;
        const version = await data.saveAssumptionVersion(
          seed.organization_id,
          seed.scenario_id,
          structuredClone(a),
          "isolated historical client",
        );
        const submitted = clientCalls
          .slice(start)
          .find((c) => c.table === "scenario_assumptions").payload;
        const stored = (
          await db.query(
            "SELECT assumptions FROM public.scenario_assumptions WHERE scenario_id=$1 AND version=$2",
            [seed.scenario_id, version],
          )
        ).rows[0].assumptions;
        assert.deepEqual(stored, submitted.assumptions);
        assert.deepEqual(stored.opexGrowth, a.opexGrowth); // Ticket linking may derive fares; F&B inputs remain untouched.
        assert.equal(submitted.calculation_version, model.CALCULATION_VERSION);
        assert.deepEqual(model.safeCalculate(stored), model.safeCalculate(submitted.assumptions));
        assert.ok(
          model.safeCalculate(stored).result,
          `Valid fixture calculation at ${revision.ref}`,
        );
      }
      const created = await data.createScenario(
        seed.organization_id,
        (await db.query("SELECT project_id FROM public.scenarios WHERE id=$1", [seed.scenario_id]))
          .rows[0].project_id,
        "Historical copy",
        "custom",
        structuredClone(base),
      );
      assert.ok(created.id);
      const project = await data.createProject(
        seed.organization_id,
        "Historical new project",
        null,
        structuredClone(base),
      );
      assert.ok(project.id);
      report.savers.push({
        commit: revision.ref,
        source_sha256: revision.sha256,
        dependency_sha256: revision.dependency_sha256,
        save_function_sha256: hash(functions(revision.text).saveAssumptionVersion),
        calculation_version: model.CALCULATION_VERSION,
        round_trips: cases.length,
        create_scenario: true,
        create_project: true,
      });
    } finally {
      await db.exec("RESET ROLE");
    }
  }
  report.distinct_save_function_bodies = saveBodyHashes.size;
  // Viewer policy remains read-only; migration has not broadened grants/RLS.
  const viewer = (
    await db.query(`INSERT INTO auth.users(email) VALUES ('viewer@example.invalid') RETURNING id`)
  ).rows[0].id;
  await db.query(
    `INSERT INTO public.organization_members(organization_id,user_id,email,role) VALUES ($1,$2,'viewer@example.invalid','viewer')`,
    [seed.organization_id, viewer],
  );
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [viewer]);
  await db.exec("SET ROLE authenticated");
  assert.ok(
    (
      await db.query("SELECT * FROM public.scenario_assumptions WHERE scenario_id=$1", [
        seed.scenario_id,
      ])
    ).rows.length,
  );
  await assert.rejects(
    db.query(
      `INSERT INTO public.scenario_assumptions(organization_id,scenario_id,version,assumptions) VALUES ($1,$2,99999,$3::jsonb)`,
      [seed.organization_id, seed.scenario_id, JSON.stringify(base)],
    ),
    /row-level security/,
  );
  await db.exec("RESET ROLE");
  report.checks.push(
    "Authenticated historical save/create paths and viewer read/write boundary pass",
  );
  for (const revision of unique("src/financialEngine.ts")) {
    const calculate = loader(revision.ref)("src/financialEngine.ts").calculate;
    for (const a of cases) {
      const id = (
        await db.query(
          "INSERT INTO public.scenario_assumptions(organization_id,scenario_id,version,assumptions) SELECT $1,$2,max(version)+1,$3::jsonb FROM public.scenario_assumptions WHERE scenario_id=$2 RETURNING id",
          [seed.organization_id, seed.scenario_id, JSON.stringify(a)],
        )
      ).rows[0].id;
      const stored = (
        await db.query("SELECT assumptions FROM public.scenario_assumptions WHERE id=$1", [id])
      ).rows[0].assumptions;
      assert.deepEqual(stored, a);
      const beforeResult = calculate(a);
      assert.ok(beforeResult.rows?.length);
      assert.deepEqual(calculate(stored), beforeResult);
    }
    report.engines.push({
      commit: revision.ref,
      source_sha256: revision.sha256,
      round_trips: cases.length,
    });
  }
  for (const revision of unique("src/lib/model.ts")) {
    const load = loader(revision.ref),
      model = load("src/lib/model.ts");
    if (!model.blankAssumptions) continue;
    const template = model.blankAssumptions("Historical template");
    assert.ok(model.safeCalculate(template).result);
    const saved = (
      await db.query(
        `INSERT INTO public.scenario_assumptions(organization_id,scenario_id,version,assumptions)
    SELECT $1,$2,max(version)+1,$3::jsonb FROM public.scenario_assumptions WHERE scenario_id=$2 RETURNING assumptions`,
        [seed.organization_id, seed.scenario_id, JSON.stringify(template)],
      )
    ).rows[0].assumptions;
    assert.deepEqual(saved, template);
    assert.deepEqual(model.safeCalculate(saved), model.safeCalculate(template));
    report.models.push({
      commit: revision.ref,
      source_sha256: revision.sha256,
      fb_growth_entries: template.opexGrowth?.fb?.length ?? 0,
    });
  }
  for (const p of [
    "src/routes/auth.tsx",
    "src/routes/reset-password.tsx",
    "src/lib/invites.functions.ts",
  ]) {
    for (const revision of unique(p))
      report.auth.push({
        path: p,
        commit: revision.ref,
        source_sha256: revision.sha256,
        invite_metadata: revision.text.includes("invite_token"),
        accept_invite_rpc: revision.text.includes('"accept_invite"'),
        signup: revision.text.includes(".signUp("),
        password_update: revision.text.includes(".updateUser("),
      });
  }
  const seenGrowthUi = new Set();
  report.growth_ui = [];
  for (const revision of unique("src/components/editor/sections.tsx")) {
    const lines = revision.text.split("\n").filter((line) => line.includes("opexGrowth"));
    if (!lines.length) continue;
    const signature = lines.join("\n");
    if (seenGrowthUi.has(signature)) continue;
    seenGrowthUi.add(signature);
    // This is an inventory for manual source review, not a synthetic rendering test.
    report.growth_ui.push({
      commit: revision.ref,
      source_sha256: revision.sha256,
      growth_lines: lines.map((line) => line.trim()),
    });
  }
  report.environment = (await db.query("SELECT version()")).rows[0].version;
  report.incompatible_reviewed_revisions = [];
  report.caveats = [
    "History is bounded to available main ancestry; no published artifact was identified",
    "Supabase transport and session provider are adapters, not managed auth or browser tests",
    "Invitation and managed role schema are local models; real production RLS/auth behavior was not accessed",
    "Old read-error, collision and autosave bugs are preserved; absence of a new migration incompatibility does not certify every historical bug fixed",
  ];
  await writeFile(
    "docs/phase1-historical-client-results.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        savers: report.savers.length,
        save_bodies: saveBodyHashes.size,
        engines: report.engines.length,
        models: report.models.length,
        auth_snapshots: report.auth.length,
        incompatible: report.incompatible_reviewed_revisions,
      },
      null,
      2,
    ),
  );
} finally {
  await db.close();
}
