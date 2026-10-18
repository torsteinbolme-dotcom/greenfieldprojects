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