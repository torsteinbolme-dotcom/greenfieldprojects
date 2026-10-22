import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentType } from "react";
import { selectComparison, validComparisonEntries } from "@/lib/comparison-selection";
import type { ProjectRow, ScenarioRow } from "@/lib/data";
import { phase1Case } from "./fixtures/phase1";
const state = vi.hoisted(() => ({ mode: "standard", selection: {} as Record<string, unknown> }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    fullPath: "/comparison/projects",
    useSearch: () => ({ ids: "p1,p2", mode: state.mode }),
  }),
  useNavigate: () => vi.fn(),
}));
vi.mock("@/components/comparison/selection", async (original) => ({
  ...(await original<typeof import("@/components/comparison/selection")>()),
  useSelection: () => state.selection,
}));
// Charts are preserved by the route but browser geometry is outside jsdom's scope.
vi.mock("recharts", async (original) => ({
  ...(await original<typeof import("recharts")>()),
  ResponsiveContainer: () => null,
}));
import { Route } from "@/routes/_authenticated/comparison.projects";
const Page = Route.options.component as ComponentType;
function setup(invalid = false) {
  const projects = [
    { id: "p1", name: "Mountain", status: "active" },
    { id: "p2", name: "Valley", status: "active" },
  ] as ProjectRow[];
  const scenarios = projects.map((p, i) => ({
    id: `s${i + 1}`,
    project_id: p.id,
    name: "Base Case",
    kind: "base",
  })) as ScenarioRow[];
  const latest = new Map(
    scenarios.map((s, i) => [
      s.id,
      {
        version: i + 2,
        assumptions: phase1Case({
          years: 10,
          exitYear: i === 0 ? 3 : 10,
          loanYears: invalid && i === 1 ? 0 : 10,
          capexItems: [{ name: "Equipment", quantity: 1, unitCost: 25000000 }],
        }),
      },
    ]),
  );
  const selected = selectComparison(["p1", "p2"], new Map(), projects, scenarios, latest);
  state.selection = {
    projects,
    scenarios,
    selected,
    entries: validComparisonEntries(selected),
    scMap: new Map(),
    loading: false,
    error: null,
  };
  state.mode = "standard";
  return selected;
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("renders the summary first and retains charts, saved-exit results and export under closed Advanced", () => {
  setup();
  render(<Page />);
  const advanced = screen
    .getByText("Advanced analysis · saved exits, charts, Sandbox and exports")
    .closest("details")!;
  expect(advanced.open).toBe(false);
  expect(screen.getByText("Investment decision summary")).toBeTruthy();
  expect(screen.getByText("Saved-exit analysis (original assumptions)")).toBeTruthy();
  expect(screen.getAllByText("Hypothetical equity IRR Y8").length).toBeGreaterThan(0);
  expect(screen.getByText(/Financial development —/)).toBeTruthy();
});
it("keeps invalid scenarios in the standard view rather than silently dropping them", () => {
  setup(true);
  render(<Page />);
  expect(screen.getByRole("alert").textContent).toContain("Loan tenor");
  expect(screen.getByText(/Saved version 3/)).toBeTruthy();
});
it("opens Advanced when a project links directly into Sandbox", () => {
  setup();
  state.mode = "sandbox";
  render(<Page />);
  expect(
    screen
      .getByText("Advanced analysis · saved exits, charts, Sandbox and exports")
      .closest("details")!.open,
  ).toBe(true);
  expect(screen.getByText(/Sandbox Mode — Simulated values/)).toBeTruthy();
});
it("exports the detailed comparison with monetary millions matching the NOK m headings", async () => {
  setup();
  let blob: Blob | undefined;
  const create = vi.fn((b: Blob) => {
    blob = b;
    return "blob:comparison";
  });
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() }));
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  render(<Page />);
  screen
    .getByText("Advanced analysis · saved exits, charts, Sandbox and exports")
    .closest("details")!.open = true;
  fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
  expect(blob).toBeTruthy();
  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsText(blob!);
  });
  const [head, line] = text
    .replace(/^\ufeff/, "")
    .split("\n")
    .map((l) => l.split(";").map((c) => c.replace(/^"|"$/g, "")));
  const capex = head!.indexOf("Total CAPEX (NOK m)");
  expect(capex).toBeGreaterThan(0);
  expect(line![capex]).toBe("25");
  expect(head).toContain("Hypothetical equity IRR Y8 (%)");
  expect(head).toContain("Saved version");
  vi.unstubAllGlobals();
});
