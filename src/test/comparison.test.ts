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
import { MOIC_YEAR, irrAtYear, metricsAt, moicAtYear, portfolioAverages } from "@/lib/portfolio";

type AvgEntry = Parameters<typeof portfolioAverages>[0][number];
const exit = { exitMultiple: 10, exitTransactionCostRate: 0 };

/** Minimal project entry: Year 3 and Year 8 rows by hand, 100 initial equity, no injections. */
const mk = (y3: { ebitda: number; passengers: number }, y8: { ebitda: number; closingDebt: number; retainedCash: number }) => ({
  a: exit,
  result: {
    equity: 100,
    // Deliberately far from the Year 8 figure: the average must read Year 8, not this exit-year MOIC.
    equityMultiple: 99,
    rows: Array.from({ length: MOIC_YEAR }, (_, i) => ({
      year: i + 1,
      ebitda: i === 7 ? y8.ebitda : i === 2 ? y3.ebitda : 0,
      passengers: i === 2 ? y3.passengers : 0,
      closingDebt: i === 7 ? y8.closingDebt : 0,
      retainedCash: i === 7 ? y8.retainedCash : 0,
      equityInjection: 0,
      distribution: 0,
    })),
  },
} as unknown as AvgEntry);

describe("moicAtYear", () => {
  it("prices a Year 8 sale on Year 8 EBITDA, debt, cash and transaction costs", () => {
    const e = mk({ ebitda: 100, passengers: 200 }, { ebitda: 20, closingDebt: 50, retainedCash: 10 });
    expect(moicAtYear(exit as never, e.result as never)).toBeCloseTo(1.6, 10); // (20 × 10 − 50 + 10) / 100
  });
  it("counts equity injected before Year 8 in the denominator", () => {
    const e = mk({ ebitda: 0, passengers: 0 }, { ebitda: 12, closingDebt: 0, retainedCash: 0 });
    const rows = (e.result as { rows: { equityInjection: number }[] }).rows;
    if (rows[3]) rows[3].equityInjection = 20;
    expect(moicAtYear(exit as never, e.result as never)).toBeCloseTo(1, 10); // (12 × 10) / (100 + 20)
  });
  it("returns null when the forecast stops before Year 8", () => {
    const short = { a: exit, result: { equity: 100, rows: [{ year: 1, ebitda: 5, closingDebt: 0, retainedCash: 0, equityInjection: 0, distribution: 0 }] } } as unknown as AvgEntry;
    expect(moicAtYear(short.a as never, short.result as never)).toBeNull();
  });
  it("gives the portfolio table the Year 8 multiple, not the scenario's own exit-year MOIC", () => {
    const e = mk({ ebitda: 100, passengers: 200 }, { ebitda: 20, closingDebt: 50, retainedCash: 10 });
    // metricsAt reads the same derivation the header chips use, so the column labelled Y8 is Y8.
    expect(metricsAt(e as never, "operating", 3).moic).toBeCloseTo(1.6, 10);
  });
});

describe("irrAtYear", () => {
  const y8 = () => mk({ ebitda: 100, passengers: 200 }, { ebitda: 20, closingDebt: 50, retainedCash: 10 });
  const y8rate = Math.pow(1.6, 1 / 8) - 1; // 100 equity in, (20 × 10 − 50 + 10) = 160 out at Year 8.

  it("prices a Year 8 sale on the engine's own cash flows", () => {
    expect(irrAtYear(exit as never, y8().result as never)).toBeCloseTo(y8rate, 8);
  });
  it("gives the portfolio table the Year 8 rate, not the scenario's own exit-year IRR", () => {
    expect(metricsAt(y8() as never, "operating", 3).irr).toBeCloseTo(y8rate, 8);
  });
  it("counts equity injected before Year 8 in the rate", () => {
    const e = y8();
    const rows = (e.result as { rows: { equityInjection: number }[] }).rows;
    if (rows[3]) rows[3].equityInjection = 20;
    expect(irrAtYear(exit as never, e.result as never)).toBeLessThan(y8rate);
  });
  it("returns null when the forecast stops before Year 8", () => {
    const short = { a: exit, result: { equity: 100, rows: [{ year: 1, ebitda: 5, closingDebt: 0, retainedCash: 0, equityInjection: 0, distribution: 0 }] } } as unknown as AvgEntry;
    expect(irrAtYear(short.a as never, short.result as never)).toBeNull();
  });
});

describe("portfolioAverages", () => {
  it("averages the Year 8 equity multiple, Year 3 EBITDA and Year 3 EBITDA per passenger", () => {
    const a = portfolioAverages([
      mk({ ebitda: 100, passengers: 200 }, { ebitda: 10, closingDebt: 0, retainedCash: 0 }),
      mk({ ebitda: 300, passengers: 300 }, { ebitda: 20, closingDebt: 50, retainedCash: 10 }),
      { a: exit as never, result: null },
    ]);
    expect(a.count).toBe(2);
    expect(a.moic).toBeCloseTo(1.3, 10); // (1.0 + 1.6) / 2 — not the 99 exit-year MOIC
    expect(a.irr).toBeCloseTo((Math.pow(1.6, 1 / 8) - 1) / 2, 8); // (0% + 6.0%) / 2 — Year 8 rates
    expect(a.ebitdaY3).toBe(200);
    expect(a.ebitdaPaxY3).toBeCloseTo(0.75, 10); // (0.5 + 1.0) / 2
  });
  it("skips projects without a Year 8 row from the Year 8 IRR average", () => {
    const short = { a: exit, result: { equity: 100, rows: [{ year: 1, ebitda: 5, closingDebt: 0, retainedCash: 0, equityInjection: 0, distribution: 0 }] } } as unknown as AvgEntry;
    const a = portfolioAverages([
      mk({ ebitda: 0, passengers: 0 }, { ebitda: 20, closingDebt: 50, retainedCash: 10 }),
      short,
    ]);
    expect(a.irr).toBeCloseTo(Math.pow(1.6, 1 / 8) - 1, 8); // only the project with a Year 8 row counts
  });
});
