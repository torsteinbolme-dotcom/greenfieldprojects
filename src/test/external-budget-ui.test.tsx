import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  ExternalBudgetWorkspace,
  type WorkspaceProps,
} from "@/components/comparison/external-budget-workspace";
import {
  annualComparison,
  annualExport,
  blankBudget,
  CONFIRMATION_LABELS,
  difference,
  editableVersion,
  inputAmount,
  projectionOfBudget,
  projectionOfInternal,
  summaryExport,
} from "@/lib/external-budget-ui";
import { captureInheritance } from "@/lib/financial-input";
import {
  BudgetConflictError,
  type BudgetHeader,
  type BudgetSaveResult,
  type BudgetVersion,
} from "@/lib/external-budget-persistence";
import { phase1Case } from "./fixtures/phase1";
const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function version(complete = false): BudgetVersion {
  const input = {
    version: "financial-input-v1",
    mode: "externalBudget",
    status: complete ? "complete" : "draft",
    initialCapex: 1000,
    annual: Array.from({ length: 10 }, (_, i) => ({
      year: i + 1,
      passengers: 100,
      ticketNetPrice: 3,
      fbRevenue: 0,
      fbOpex: 0,
      cableOpex: 100,
    })),
    accounting: Object.fromEntries(Object.keys(CONFIRMATION_LABELS).map((k) => [k, true])),
    inheritance: captureInheritance(phase1Case()),
  };
  return {
    id: id(4),
    budget_id: id(3),
    organization_id: id(2),
    project_id: id(1),
    version: 1,
    action: "create",
    name: "External plan",
    description: null,
    source_info: { label: "Operator budget" },
    input,
    schema_version: "external-budget-document-v1",
    financial_contract_version: "financial-input-v1",
    source_scenario_id: id(6),
    source_assumption_id: id(7),
    source_assumption_version: 1,
    source_calculation_version: "mountain-v5-volume",
    source_assumptions: phase1Case(),
    duplicated_from_budget_id: null,
    duplicated_from_version_id: null,
    created_by: id(8),
    created_at: "2026-10-22T12:00:00Z",
  } as BudgetVersion;
}
function setup(v: BudgetVersion | undefined = version(), patch: Partial<WorkspaceProps> = {}) {
  const header = {
    id: id(3),
    project_id: id(1),
    organization_id: id(2),
    current_version_id: id(4),
    archived_at: null,
  } as BudgetHeader;
  const result = { budget: header, version: { ...v, id: id(9), version: 2 } } as BudgetSaveResult;
  const p: WorkspaceProps = {
    projectId: id(1),
    projectName: "Synthetic Mountain",
    canEdit: true,
    internal: {
      id: id(7),
      scenario_id: id(6),
      version: 1,
      calculation_version: "mountain-v5-volume",
      assumptions: phase1Case(),
    },
    scenarioName: "Base Case",
    headers: v ? [header] : [],
    history: v ? [v] : [],
    selectedBudget: v ? id(3) : "",
    selectedVersion: v ? v.id : "",
    onBudget: vi.fn(),
    onVersion: vi.fn(),
    mutate: vi.fn().mockResolvedValue(result),
    onSaved: vi.fn(),
    onReload: vi.fn(),
    ...patch,
  };
  render(<ExternalBudgetWorkspace {...p} />);
  return p;
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("preserves explicit zero, arbitrary supplied precision and missing numeric values", () => {
  expect(inputAmount("")).toBeUndefined();
  expect(inputAmount("0")).toBe(0);
  expect(inputAmount("3,123456789")).toBe(3.123456789);
  for (const bad of ["-1", "NaN", "Infinity", "1e999", "3x"])
    expect(() => inputAmount(bad)).toThrow();
});
it("strips only inheritance from editable documents without mutating saved input", () => {
  const v = version(),
    before = JSON.stringify(v);
  const doc = editableVersion(v);
  expect("inheritance" in doc.input).toBe(false);
  doc.name = "Edit";
  expect(JSON.stringify(v)).toBe(before);
});
it("uses independent reference Year 3/8 values for the external comparison", () => {
  const p = projectionOfBudget(version(true)).projection!;
  expect(p.summary.revenue).toBe(300);
  expect(p.summary.ebitda).toBe(200);
  expect(p.summary.passengers).toBe(100);
  expect(p.summary.ticketNetPrice).toBe(3);
  expect(p.summary.revenuePerPassenger).toBe(3);
  expect(p.summary.ebitdaPerPassenger).toBe(2);
  expect(p.summary.enterpriseValue).toBe(1000);
  expect(p.summary.exitEquityValue).toBe(1430.4);
  expect(p.summary.moic).toBe(3.576);
  expect(p.summary.irr).toBeCloseTo(3.576 ** (1 / 8) - 1, 9);
});
it("never calculates incomplete drafts, even with invalid unused inherited fields", () => {
  const v = version();
  v.input = {
    version: "financial-input-v1",
    mode: "externalBudget",
    status: "draft",
    inheritance: { loanYears: 0 } as never,
  };
  expect(projectionOfBudget(v)).toEqual({ projection: null, error: null });
});
it("reports invalid complete inheritance visibly rather than fabricating results", () => {
  const v = version(true);
  v.input = { ...v.input, inheritance: { ...v.input.inheritance, loanYears: 0 } } as never;
  expect(projectionOfBudget(v).projection).toBeNull();
  expect(projectionOfBudget(v).error).toMatch(/tenor/i);
});
it("does not extrapolate short internal horizons and preserves calendar years", () => {
  const a = projectionOfInternal(phase1Case({ years: 3, exitYear: 3 })).projection!,
    b = projectionOfBudget(version(true)).projection!;
  const rows = annualComparison(a, b, "passengers");
  expect(rows).toHaveLength(10);
  expect(rows[2]).toMatchObject({
    internal: 100,
    external: 100,
    variance: 0,
    internalYear: 2032,
    externalYear: 2032,
  });
  expect(rows[3]).toMatchObject({
    internal: null,
    external: 100,
    variance: null,
    internalYear: null,
  });
  expect(a.summary.irr).toBeNull();
});
it("uses absolute variance, propagates unavailable numbers and labels percentage points", () => {
  expect(difference(2, 5)).toBe(3);
  expect(difference(null, 0)).toBeNull();
  expect(difference(NaN, 1)).toBeNull();
  const b = projectionOfBudget(version(true)).projection!;
  const a = structuredClone(b);
  a.summary.margin = 0.5;
  a.summary.irr = 0.1;
  const csv = summaryExport(a, b, "=UNTRUSTED budget");
  expect(csv).toContain("'=UNTRUSTED");
  expect(csv).toContain("percentage points");
  expect(csv).toContain("16.666666666666664");
  const annual = annualExport(null, b, "passengers", "count", "Pinned source");
  expect(annual).toContain("N/A");
  expect(annual).toContain("External minus internal (guests)");
});
it("creates an incomplete named draft without injecting zero or inherited caller fields", async () => {
  const p = setup(undefined, { history: [], headers: [], selectedBudget: "", selectedVersion: "" });
  fireEvent.change(screen.getByLabelText("Budget name"), { target: { value: "New draft" } });
  fireEvent.click(screen.getByText("Save draft"));
  await waitFor(() => expect(p.mutate).toHaveBeenCalledTimes(1));
  const c = vi.mocked(p.mutate).mock.calls[0]![0];
  expect(c.operation).toBe("create");
  if (c.operation !== "create") throw Error();
  expect(c.document.input).toEqual(blankBudget().input);
  expect(c.source).toEqual({ scenarioId: id(6), assumptionId: id(7) });
});
it("saves edits as a new version with the exact expected version and leaves internal assumptions untouched", async () => {
  const p = setup();
  const before = JSON.stringify(p.internal!.assumptions);
  fireEvent.change(screen.getByLabelText("Year 3 Passengers"), { target: { value: "0" } });
  fireEvent.click(screen.getByText("Save draft"));
  await waitFor(() => expect(p.mutate).toHaveBeenCalledTimes(1));
  const c = vi.mocked(p.mutate).mock.calls[0]![0];
  expect(c.operation).toBe("save");
  if (c.operation !== "save") throw Error();
  expect(c.expectedVersionId).toBe(id(4));
  expect(c.document.input.annual![2]!.passengers).toBe(0);
  expect(JSON.stringify(p.internal!.assumptions)).toBe(before);
  expect("inheritance" in c.document.input).toBe(false);
});
it("clearing a numeric cell omits it rather than substituting zero", async () => {
  const p = setup();
  fireEvent.change(screen.getByLabelText("Year 1 F&B revenue"), { target: { value: "" } });
  fireEvent.click(screen.getByText("Save draft"));
  await waitFor(() => expect(p.mutate).toHaveBeenCalled());
  const c = vi.mocked(p.mutate).mock.calls[0]![0];
  if (c.operation !== "save") throw Error();
  expect(c.document.input.annual![0]).not.toHaveProperty("fbRevenue");
});
it("blocks invalid text from saving a stale previously valid numeric value", async () => {
  const p = setup();
  fireEvent.change(screen.getByLabelText("Year 1 Passengers"), { target: { value: "oops" } });
  fireEvent.click(screen.getByText("Save draft"));
  expect(p.mutate).not.toHaveBeenCalled();
  expect(screen.getByText("Correct the invalid numeric input before saving.")).toBeTruthy();
});
it("requires all confirmations and ten complete rows before sending completion", () => {
  const v = version();
  v.input = { version: "financial-input-v1", mode: "externalBudget", status: "draft" };
  const p = setup(v);
  fireEvent.click(screen.getByText("Save complete budget"));
  expect(p.mutate).not.toHaveBeenCalled();
  expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
});
it("sends a fully completed budget using the approved contract", async () => {
  const p = setup(version(true));
  fireEvent.click(screen.getByText("Save complete budget"));
  await waitFor(() => expect(p.mutate).toHaveBeenCalled());
  const c = vi.mocked(p.mutate).mock.calls[0]![0];
  if (c.operation !== "save") throw Error();
  expect(c.document.input.status).toBe("complete");
});
it.each(["Duplicate in this project", "Archive"])(
  "performs %s through the versioned API",
  async (label) => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const p = setup();
    fireEvent.click(screen.getByText(label));
    await waitFor(() => expect(p.mutate).toHaveBeenCalled());
    expect(vi.mocked(p.mutate).mock.calls[0]![0].operation).toBe(
      label === "Archive" ? "archive" : "duplicate",
    );
  },
);
it("restores an archived budget without enabling direct edits", async () => {
  const v = version();
  const h = { id: id(3), current_version_id: id(4), archived_at: "2026-10-22" } as BudgetHeader;
  const p = setup(v, { headers: [h] });
  expect(screen.getByLabelText("Budget name")).toBeDisabled();
  fireEvent.click(screen.getByText("Restore"));
  await waitFor(() => expect(p.mutate).toHaveBeenCalled());
  expect(vi.mocked(p.mutate).mock.calls[0]![0].operation).toBe("restore");
});
it("keeps viewer access read-only with no lifecycle controls", () => {
  const p = setup(version(true), { canEdit: false });
  expect(screen.getByLabelText("Budget name")).toBeDisabled();
  expect(screen.queryByText("Save draft")).toBeNull();
  expect(screen.queryByText("Archive")).toBeNull();
  expect(p.mutate).not.toHaveBeenCalled();
});
it("makes historical versions read only and keeps version selection explicit", () => {
  const old = version();
  old.id = id(10);
  const p = setup(old);
  expect(screen.getByText(/Historical version/)).toBeTruthy();
  expect(screen.getByLabelText("Year 3 Passengers")).toBeDisabled();
  fireEvent.change(screen.getByLabelText("External saved version"), { target: { value: "" } });
  expect(p.onVersion).toHaveBeenCalledWith("");
});
it("discloses different pinned sources and blocks refreshing from another scenario", () => {
  setup(version(true), {
    internal: {
      id: id(33),
      scenario_id: id(34),
      version: 3,
      calculation_version: "v5",
      assumptions: phase1Case(),
    },
  });
  expect(screen.getByText(/Different inheritance:/)).toBeTruthy();
  expect(screen.getByText("Refresh inheritance explicitly")).toBeDisabled();
});
it("uses explicit same-scenario refresh rather than silently changing inheritance", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const p = setup(version(true), {
    internal: {
      id: id(33),
      scenario_id: id(6),
      version: 3,
      calculation_version: "v5",
      assumptions: phase1Case(),
    },
  });
  fireEvent.click(screen.getByText("Refresh inheritance explicitly"));
  await waitFor(() => expect(p.mutate).toHaveBeenCalled());
  const c = vi.mocked(p.mutate).mock.calls[0]![0];
  if (c.operation !== "refresh") throw Error();
  expect(c.source).toEqual({ scenarioId: id(6), assumptionId: id(33) });
});
it("continues calculating from pinned inheritance after source deletion", () => {
  setup(version(true), { internal: undefined, scenarioName: undefined });
  expect(screen.getByText("Refresh inheritance explicitly")).toBeDisabled();
  expect(screen.getByText(/Different inheritance:/)).toBeTruthy();
  expect(screen.getAllByText("3,58x").length).toBeGreaterThan(0);
});
it("retains edits and stops automatic retries after an optimistic concurrency conflict", async () => {
  const mutate = vi.fn().mockRejectedValue(new BudgetConflictError());
  setup(version(), { mutate });
  fireEvent.change(screen.getByLabelText("Budget name"), { target: { value: "Keep these edits" } });
  fireEvent.click(screen.getByText("Save draft"));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/changed/));
  expect(screen.getByLabelText("Budget name")).toHaveValue("Keep these edits");
  expect(screen.getByText("Save draft")).toBeDisabled();
  expect(mutate).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Reload current version")).toBeTruthy();
});
it("protects unsaved edits when switching budgets", () => {
  vi.spyOn(window, "confirm").mockReturnValue(false);
  const p = setup();
  fireEvent.change(screen.getByLabelText("Budget name"), { target: { value: "Unsaved" } });
  fireEvent.change(screen.getByLabelText("Named external budget"), { target: { value: "" } });
  expect(p.onBudget).not.toHaveBeenCalled();
});
it("provides contained horizontal tables and collapsed advanced sections for narrow layouts", () => {
  setup(version(true));
  expect(screen.getByRole("region", { name: "Ten-year external input table" })).toHaveClass(
    "overflow-x-auto",
  );
  expect(screen.getByLabelText("Budget name").closest("fieldset")).toHaveClass("min-w-0");
  expect(
    screen.getByText("Advanced · source references and accounting scope").closest("details"),
  ).not.toHaveAttribute("open");
  expect(screen.getByText(/Advanced analysis · inherited/).closest("details")).not.toHaveAttribute(
    "open",
  );
  expect(screen.getByRole("button", { name: "Export annual CSV" })).toBeTruthy();
});

it("fails explicitly when a selected external version is unavailable instead of creating a replacement", () => {
  const p = setup(version(), { selectedVersion: id(55) });
  expect(screen.getByRole("alert")).toHaveTextContent("unavailable");
  expect(screen.queryByText("Save draft")).toBeNull();
  expect(p.mutate).not.toHaveBeenCalled();
});
