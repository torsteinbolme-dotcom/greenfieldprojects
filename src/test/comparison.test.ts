import { describe, expect, it } from "vitest";
import { comparisonYears, devValue, sortByMetric } from "@/lib/portfolio";

const forecast = (start: number, length: number) => ({
  rows: Array.from({ length }, (_, i) => ({ calendarYear: start + i })),
});

describe("comparison display horizon", () => {
  it("limits operating-year comparisons to years 1 through 15", () => {
    expect(comparisonYears([forecast(2030, 30), forecast(2035, 25)], "operating"))
      .toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
  });
  it("limits calendar-year comparisons to 15 aligned years from the first opening", () => {
    expect(comparisonYears([forecast(2030, 30), forecast(2035, 25)], "calendar"))
      .toEqual(Array.from({ length: 15 }, (_, i) => 2030 + i));
  });
  it("does not extend short or empty forecasts", () => {
    expect(comparisonYears([forecast(2030, 3)], "operating")).toEqual([1, 2, 3]);
    expect(comparisonYears([forecast(2030, 3)], "calendar")).toEqual([2030, 2031, 2032]);
    expect(comparisonYears([], "calendar")).toEqual([]);
    expect(comparisonYears([], "operating")).toEqual([]);
  });
});

describe("comparison table sorting", () => {
  const rows = [
    { name: "Project Mountain", moic: 2.4 },
    { name: "Project Heaven", moic: 3.1 },
    { name: "Alpha Ridge", moic: 1.05 },
  ];
  it("puts the highest MOIC first when sorted descending", () => {
    expect(sortByMetric(rows, (r) => r.moic, "desc").map((r) => r.name))
      .toEqual(["Project Heaven", "Project Mountain", "Alpha Ridge"]);
  });
  it("puts the lowest MOIC first when sorted ascending", () => {
    expect(sortByMetric(rows, (r) => r.moic, "asc").map((r) => r.name))
      .toEqual(["Alpha Ridge", "Project Mountain", "Project Heaven"]);
  });
  it("sorts text columns alphabetically without reordering the source rows", () => {
    expect(sortByMetric(rows, (r) => r.name, "asc").map((r) => r.name))
      .toEqual(["Alpha Ridge", "Project Heaven", "Project Mountain"]);
    expect(rows.map((r) => r.name)).toEqual(["Project Mountain", "Project Heaven", "Alpha Ridge"]);
  });
});

describe("comparison development chart metrics", () => {
  const row = { passengers: 200_000, revenue: 120_000_000, ebitda: 40_000_000 };
  it("plots revenue and EBITDA per passenger as NOK per guest", () => {
    expect(devValue("revPax", row, 0)).toBe(600);
    expect(devValue("ebitdaPax", row, 0)).toBe(200);
  });
  it("plots money totals in NOK m and free cash flow from the returns series", () => {
    expect(devValue("revenue", row, 0)).toBe(120);
    expect(devValue("ebitda", row, 0)).toBe(40);
    expect(devValue("fcf", row, 15_000_000)).toBe(15);
  });
  it("leaves a year with no passengers or no forecast row unplotted", () => {
    expect(devValue("revPax", { ...row, passengers: 0 }, 0)).toBeNull();
    expect(devValue("ebitdaPax", { ...row, passengers: 0 }, 0)).toBeNull();
    expect(devValue("revPax", null, 0)).toBeNull();
  });
});
import { portfolioAverages } from "@/lib/portfolio";
describe("portfolioAverages", () => {
  it("averages MOIC, Y3 EBITDA and Y3 EBITDA per passenger across projects", () => {
    const mk = (moic: number, ebitda: number, pax: number) => ({ result: { equityMultiple: moic, rows: [{}, {}, { ebitda, passengers: pax }] } as never });
    const a = portfolioAverages([mk(2, 100, 200), mk(4, 300, 300), { result: null }]);
    expect(a.count).toBe(2);
    expect(a.moic).toBe(3);
    expect(a.ebitdaY3).toBe(200);
    expect(a.ebitdaPaxY3).toBe(0.75);
  });
});
