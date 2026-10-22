import { describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import * as financial from "@/lib/financial-input";
import {
  BUDGET_SCHEMA_VERSION,
  BudgetConflictError,
  assertBudgetJson,
  executeBudgetCommand,
  parseBudgetCommand,
  prepareBudgetDocument,
  type BudgetDocument,
  type BudgetStore,
  type BudgetVersion,
  type BudgetSaveResult,
} from "@/lib/external-budget-persistence";
import { phase1Case } from "./fixtures/phase1";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1),
  project = id(2),
  budget = id(3),
  versionId = id(4),
  scenario = id(5),
  assumption = id(6);
const draft = (): BudgetDocument => ({
  name: "Named budget",
  description: null,
  sourceInfo: { notes: "Source notes" },
  input: { version: "financial-input-v1", mode: "externalBudget", status: "draft" },
});
const complete = (): BudgetDocument => ({
  ...draft(),
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
const pinned = financial.captureInheritance(phase1Case());
function store() {
  const current: BudgetVersion = {
    id: versionId,
    budget_id: budget,
    organization_id: id(7),
    project_id: project,
    version: 1,
    action: "create",
    name: "Original",
    description: null,
    source_info: {},
    input: prepareBudgetDocument(complete(), pinned).input,
    schema_version: BUDGET_SCHEMA_VERSION,
    financial_contract_version: "financial-input-v1",
    source_scenario_id: scenario,
    source_assumption_id: assumption,
    source_assumption_version: 1,
    source_calculation_version: "mountain-v5-volume",
    source_assumptions: null,
    duplicated_from_budget_id: null,
    duplicated_from_version_id: null,
    created_by: actor,
    created_at: "2030-01-01T00:00:00Z",
  };
  const saved = { version: current, budget: { id: budget } } as BudgetSaveResult;
  const adapter: BudgetStore = {
    readCurrent: vi.fn(async () => current),
    readSource: vi.fn(async () => ({
      id: assumption,
      scenarioId: scenario,
      version: 1,
      calculationVersion: "mountain-v5-volume",
      assumptions: phase1Case(),
    })),
    commit: vi.fn(async () => saved),
  };
  return { adapter, current };
}

describe("External budget serialization and version orchestration", () => {
  it("round-trips an incomplete draft without fabricating annual figures or calculating", () => {
    const calculate = vi.spyOn(financial, "calculateExternalBudget");
    try {
      const original = draft();
      const prepared = prepareBudgetDocument(original);
      expect(JSON.parse(JSON.stringify(prepared))).toEqual(original);
      expect(calculate).not.toHaveBeenCalled();
    } finally {
      calculate.mockRestore();
    }
  });
  it("preserves partial drafts and explicit zero independently from missing values", () => {
    const document: BudgetDocument = {
      ...draft(),
      input: {
        ...draft().input,
        status: "draft",
        initialCapex: 0,
        annual: [
          { year: 1, passengers: 0 },
          { year: 2, ticketNetPrice: 0 },
        ],
        accounting: { ticketAlreadyNet: true },
      },
    };
    expect(prepareBudgetDocument(document)).toEqual(document);
    expect(JSON.parse(JSON.stringify(prepareBudgetDocument(document)))).toEqual(document);
  });
  it("serializes complete input exactly, with pinned inheritance and no calculated results", () => {
    const original = complete();
    const before = structuredClone(original);
    const result = prepareBudgetDocument(original, pinned);
    expect(result.input).toEqual({ ...original.input, inheritance: pinned });
    expect(Object.keys(result)).toEqual(["name", "description", "sourceInfo", "input"]);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(original).toEqual(before);
  });
  it.each([undefined, NaN, Infinity, -Infinity, new Date(), 1n, () => 1])(
    "rejects lossy/non-JSON draft value %s",
    (value) => {
      expect(() => assertBudgetJson({ amount: value })).toThrow(/JSON/);
    },
  );
  it("rejects sparse drafts rather than converting holes to null", () => {
    const values = [1, 2];
    delete values[0];
    expect(() => assertBudgetJson(values)).toThrow();
  });
  it("requires source inheritance and valid accounting/annual inputs before completion", () => {
    expect(() => prepareBudgetDocument(complete())).toThrow(/inheritance/);
    const document = complete();
    expect(() =>
      prepareBudgetDocument(
        {
          ...document,
          input: { ...document.input, status: "complete", annual: [] },
        } as BudgetDocument,
        pinned,
      ),
    ).toThrow();
    expect(() =>
      prepareBudgetDocument(
        { ...document, input: { ...document.input, accounting: {} } } as BudgetDocument,
        pinned,
      ),
    ).toThrow();
  });
  it("rejects calculated fields and caller-forged inheritance in incoming documents", () => {
    expect(() =>
      prepareBudgetDocument({ ...complete(), ebitda: 100 } as BudgetDocument, pinned),
    ).toThrow();
    const input = { ...complete().input, inheritance: pinned };
    expect(() =>
      prepareBudgetDocument({ ...complete(), input } as BudgetDocument, pinned),
    ).toThrow();
  });
  it("creates a source-free incomplete draft without a source lookup or calculation", async () => {
    const { adapter } = store();
    const calculate = vi.spyOn(financial, "calculateExternalBudget");
    try {
      await executeBudgetCommand(adapter, actor, {
        operation: "create",
        projectId: project,
        document: draft(),
      });
      expect(adapter.readSource).not.toHaveBeenCalled();
      expect(calculate).not.toHaveBeenCalled();
      expect(adapter.commit).toHaveBeenCalledWith(
        expect.objectContaining({
          actor,
          budget: null,
          expected: null,
          capture: null,
          payload: draft(),
        }),
      );
    } finally {
      calculate.mockRestore();
    }
  });
  it("captures the selected real source only on creation or explicit refresh", async () => {
    const { adapter } = store();
    await executeBudgetCommand(adapter, actor, {
      operation: "create",
      projectId: project,
      source: { scenarioId: scenario, assumptionId: assumption },
      document: complete(),
    });
    expect(adapter.readSource).toHaveBeenCalledWith(project, {
      scenarioId: scenario,
      assumptionId: assumption,
    });
    expect(adapter.commit).toHaveBeenCalledWith(
      expect.objectContaining({
        capture: expect.objectContaining({ id: assumption, scenarioId: scenario }),
        payload: expect.objectContaining({
          input: expect.objectContaining({ inheritance: pinned }),
        }),
      }),
    );
  });
  it("saves against the pinned inheritance without reloading a deleted or changed source", async () => {
    const { adapter, current } = store();
    await executeBudgetCommand(adapter, actor, {
      operation: "save",
      projectId: project,
      budgetId: budget,
      expectedVersionId: versionId,
      document: complete(),
    });
    expect(adapter.readSource).not.toHaveBeenCalled();
    expect(adapter.commit).toHaveBeenCalledWith(
      expect.objectContaining({
        capture: null,
        expected: versionId,
        payload: expect.objectContaining({ input: current.input }),
      }),
    );
  });
  it("refresh pins a newly selected assumption version without mutating the old version", async () => {
    const { adapter, current } = store();
    const before = structuredClone(current);
    vi.mocked(adapter.readSource).mockResolvedValue({
      id: id(99),
      scenarioId: scenario,
      version: 2,
      calculationVersion: "mountain-v5-volume",
      assumptions: phase1Case({ interestRate: 0.05 }),
    });
    await executeBudgetCommand(adapter, actor, {
      operation: "refresh",
      projectId: project,
      budgetId: budget,
      expectedVersionId: versionId,
      source: { scenarioId: scenario, assumptionId: id(99) },
      document: complete(),
    });
    expect(adapter.commit).toHaveBeenCalledWith(
      expect.objectContaining({
        capture: expect.objectContaining({ id: id(99), version: 2 }),
        payload: expect.objectContaining({
          input: expect.objectContaining({
            inheritance: expect.objectContaining({ interestRate: 0.05 }),
          }),
        }),
      }),
    );
    expect(current).toEqual(before);
  });
  it("rejects changing the linked scenario during refresh", async () => {
    const { adapter } = store();
    vi.mocked(adapter.readSource).mockResolvedValue({
      id: id(99),
      scenarioId: id(98),
      version: 1,
      calculationVersion: "mountain-v5-volume",
      assumptions: phase1Case(),
    });
    await expect(
      executeBudgetCommand(adapter, actor, {
        operation: "refresh",
        projectId: project,
        budgetId: budget,
        expectedVersionId: versionId,
        source: { scenarioId: id(98), assumptionId: id(99) },
        document: complete(),
      }),
    ).rejects.toThrow(/linked scenario/);
    expect(adapter.commit).not.toHaveBeenCalled();
  });
  it.each(["save", "archive", "restore", "duplicate", "refresh"])(
    "rejects stale %s without retry or commit",
    async (operation) => {
      const { adapter } = store();
      const data = {
        operation,
        projectId: project,
        budgetId: budget,
        expectedVersionId: id(99),
        ...(operation === "save" || operation === "refresh" ? { document: complete() } : {}),
        ...(operation === "duplicate" ? { name: "copy" } : {}),
        ...(operation === "refresh"
          ? { source: { scenarioId: scenario, assumptionId: assumption } }
          : {}),
      };
      await expect(executeBudgetCommand(adapter, actor, data)).rejects.toBeInstanceOf(
        BudgetConflictError,
      );
      expect(adapter.commit).not.toHaveBeenCalled();
      expect(adapter.readSource).not.toHaveBeenCalled();
    },
  );
  it("rejects actor/provenance/organization overrides and anonymous mutations", async () => {
    const command = { operation: "create", projectId: project, document: draft() };
    expect(() => parseBudgetCommand({ ...command, actor: id(99) })).toThrow();
    expect(() => parseBudgetCommand({ ...command, organizationId: id(99) })).toThrow();
    expect(() => parseBudgetCommand({ ...command, duplicatedFromVersionId: id(99) })).toThrow();
    const { adapter } = store();
    await expect(executeBudgetCommand(adapter, "", command)).rejects.toThrow(/Unauthorized/);
    expect(adapter.commit).not.toHaveBeenCalled();
  });
  it("does not retry a database CAS conflict occurring after the read", async () => {
    const { adapter } = store();
    vi.mocked(adapter.commit).mockRejectedValue(new BudgetConflictError());
    await expect(
      executeBudgetCommand(adapter, actor, {
        operation: "archive",
        projectId: project,
        budgetId: budget,
        expectedVersionId: versionId,
      }),
    ).rejects.toBeInstanceOf(BudgetConflictError);
    expect(adapter.commit).toHaveBeenCalledTimes(1);
  });
});

// Deliberately opt-in: no default DATABASE_URL or managed service can be substituted.
const isolatedModule = process.env["EXTERNAL_BUDGET_PGLITE_MODULE"];
describe.runIf(!!isolatedModule)("Isolated PostgreSQL authorization acceptance", () => {
  it("executes migration, RLS, immutable history, lifecycle and recovery assertions on real PostgreSQL/WASM", () => {
    const output = execFileSync(
      process.execPath,
      ["scripts/rehearse-external-budget-persistence.mjs", isolatedModule!],
      { cwd: process.cwd(), encoding: "utf8", timeout: 120000 },
    );
    const report = JSON.parse(output);
    expect(report.passed).toBeGreaterThanOrEqual(65);
    expect(report.environment).toContain("PostgreSQL");
    expect(report.checks).toContain(
      "source deletion preserves immutable historical identity and reproducibility",
    );
  }, 120000);
});
