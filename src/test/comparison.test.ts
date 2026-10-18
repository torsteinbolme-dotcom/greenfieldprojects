import { describe, expect, it } from "vitest";
import { comparisonYears } from "@/lib/portfolio";

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