import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { DecisionComparison } from "@/components/comparison/decision-comparison";
import { selectComparison } from "@/lib/comparison-selection";
import { projectSelections } from "@/lib/comparison-projection";
import { phase1Case } from "./fixtures/phase1";
import type { ProjectRow, ScenarioRow } from "@/lib/data";
const project = { id: "p1", name: "Mountain", status: "active" } as ProjectRow;
const scenario = { id: "s1", project_id: "p1", name: "Base Case", kind: "base" } as ScenarioRow;
const selection = (invalid = false, years = 8) =>
  projectSelections(
    selectComparison(
      ["p1"],
      new Map(),
      [project],
      [scenario],
      new Map([
        [
          "s1",
          {
            version: 17,
            assumptions: phase1Case({ years, exitYear: 1, loanYears: invalid ? 0 : 10 }),
          },
        ],
      ]),
    ),
  );
afterEach(cleanup);
describe("decision comparison interface", () => {
  it("shows selection identity, financing and explicit net/gross price meanings without financial editors", () => {
    render(<DecisionComparison selected={selection()} onRemove={vi.fn()} />);
    expect(screen.getByText(/Saved version 17/)).toBeTruthy();
    expect(screen.getByText(/Debt 60[.,]0%/)).toBeTruthy();
    expect(screen.getByText(/Gross adult round-trip fare incl. VAT \(saved input\)/)).toBeTruthy();
    expect(screen.getByText(/Year 3 average realized ticket, net/)).toBeTruthy();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryAllByRole("spinbutton")).toHaveLength(0);
  });
  it("keeps an invalid selection visible with its version, error and unavailable values", () => {
    render(<DecisionComparison selected={selection(true)} onRemove={vi.fn()} />);
    expect(screen.getByRole("alert").textContent).toContain("Loan tenor");
    expect(screen.getByText(/Saved version 17/)).toBeTruthy();
    expect(screen.getAllByText("N/A").length).toBeGreaterThan(10);
  });
  it("shows exactly ten operating years and calendar context without extending short models", () => {
    render(<DecisionComparison selected={selection(false, 2)} onRemove={vi.fn()} />);
    const table = screen.getAllByRole("table")[1]!;
    const cells = within(table).getAllByRole("cell");
    expect(within(table).getAllByRole("columnheader")).toHaveLength(11);
    expect(within(table).getByText("2030")).toBeTruthy();
    expect(within(table).getByText("2031")).toBeTruthy();
    expect(cells.filter((c) => c.textContent === "N/A")).toHaveLength(8);
    expect(screen.getByText(/Year 8 is outside/)).toBeTruthy();
  });
  it("switches the display-only annual metric and preserves the selected scenario", () => {
    render(<DecisionComparison selected={selection()} onRemove={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Annual comparison metric"), {
      target: { value: "fbOpex" },
    });
    expect((screen.getByLabelText("Annual comparison metric") as HTMLSelectElement).value).toBe(
      "fbOpex",
    );
    expect(screen.getByText(/Saved version 17/)).toBeTruthy();
  });
  it("lets users remove an unavailable selection", () => {
    const remove = vi.fn();
    render(<DecisionComparison selected={selection(true)} onRemove={remove} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Mountain" }));
    expect(remove).toHaveBeenCalledWith("p1");
  });
});
