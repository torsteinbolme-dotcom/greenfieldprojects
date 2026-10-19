import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ForecastSection } from "@/components/editor/sections";
import { calculate } from "@/financialEngine";
import { projectMountain } from "@/exampleProject";

describe("forecast input readiness", () => {
  it("does not crash before assumptions arrive and resumes rendering when supplied", () => {
    const result = calculate(projectMountain);
    let view: ReturnType<typeof render> | undefined;
    expect(() => {
      view = render(<ForecastSection r={result} a={undefined} />);
    }).not.toThrow();
    if (!view) throw new Error("Forecast did not mount");
    expect(() => view?.rerender(<ForecastSection r={result} a={projectMountain} />)).not.toThrow();
    view.unmount();
  });
});

const belowEbitda = [
  "Depreciation",
  "Interest",
  "Principal",
  "Tax",
  "Operating cash flow (EBITDA − tax)",
  "Maintenance CAPEX",
  "Debt service (interest + principal)",
];

describe("forecast below-EBITDA dropdown", () => {
  it("starts collapsed and reveals every below-EBITDA item when opened", () => {
    const view = render(<ForecastSection r={calculate(projectMountain)} a={projectMountain} />);
    expect(screen.getByText("Below EBITDA")).toBeTruthy();
    belowEbitda.forEach((label) => expect(screen.queryByText(label)).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Expand below ebitda" }));
    belowEbitda.forEach((label) => expect(screen.getByText(label)).toBeTruthy());
    view.unmount();
  });

  it("hides the items again but keeps the section header clickable", () => {
    const view = render(<ForecastSection r={calculate(projectMountain)} a={projectMountain} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand below ebitda" }));
    fireEvent.click(screen.getByRole("button", { name: "Collapse below ebitda" }));
    belowEbitda.forEach((label) => expect(screen.queryByText(label)).toBeNull());
    expect(screen.getByRole("button", { name: "Expand below ebitda" })).toBeTruthy();
    view.unmount();
  });

  it("leaves the always-visible lines untouched while the section is collapsed", () => {
    const view = render(<ForecastSection r={calculate(projectMountain)} a={projectMountain} />);
    ["Passengers", "Total revenue", "Total OPEX", "EBITDA", "EBITDA margin", "Cash flow after debt service"]
      .forEach((label) => expect(screen.getByText(label)).toBeTruthy());
    view.unmount();
  });
});

const equityCashDebt = [
  "Additional equity contributions",
  "Exit proceeds to equity",
  "Retained cash (cumulative)",
  "Closing debt",
  "DSCR",
];

describe("forecast equity, cash & debt dropdown", () => {
  it("starts collapsed and reveals every equity, cash and debt item when opened", () => {
    const view = render(<ForecastSection r={calculate(projectMountain)} a={projectMountain} />);
    expect(screen.getByText("Equity, cash & debt")).toBeTruthy();
    equityCashDebt.forEach((label) => expect(screen.queryByText(label)).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Expand equity, cash & debt" }));
    equityCashDebt.forEach((label) => expect(screen.getByText(label)).toBeTruthy());
    view.unmount();
  });

  it("hides the items again but keeps the section header clickable", () => {
    const view = render(<ForecastSection r={calculate(projectMountain)} a={projectMountain} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand equity, cash & debt" }));
    fireEvent.click(screen.getByRole("button", { name: "Collapse equity, cash & debt" }));
    equityCashDebt.forEach((label) => expect(screen.queryByText(label)).toBeNull());
    expect(screen.getByRole("button", { name: "Expand equity, cash & debt" })).toBeTruthy();
    view.unmount();
  });

  it("collapses independently of the below-EBITDA section", () => {
    const view = render(<ForecastSection r={calculate(projectMountain)} a={projectMountain} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand equity, cash & debt" }));
    expect(screen.getByText("Closing debt")).toBeTruthy();
    expect(screen.queryByText("Depreciation")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand below ebitda" }));
    expect(screen.getByText("Depreciation")).toBeTruthy();
    expect(screen.getByText("Closing debt")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Collapse equity, cash & debt" }));
    expect(screen.queryByText("Closing debt")).toBeNull();
    expect(screen.getByText("Depreciation")).toBeTruthy();
    view.unmount();
  });
});
