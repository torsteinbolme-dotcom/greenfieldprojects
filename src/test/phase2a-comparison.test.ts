import { describe, expect, it } from "vitest";
import { safeCalculate } from "@/lib/model";
import {
  projectComparison,
  projectSelections,
  SUMMARY_METRICS,
  ANNUAL_METRICS,
  OPERATING_YEARS,
  comparisonCsvValue,
  comparisonCsv,
} from "@/lib/comparison-projection";
import { selectComparison, validComparisonEntries } from "@/lib/comparison-selection";
import type { ProjectRow, ScenarioRow } from "@/lib/data";
import { phase1Case } from "./fixtures/phase1";
import { defaultOperationsInputs } from "@/lib/advanced-operations";
import { defaultDemandInputs } from "@/lib/advanced-demand";
import { defaultCapexInputs } from "@/lib/advanced-capex";
import type { AssumptionsWithAdvanced } from "@/lib/advanced";
import { forecastOpex } from "@/lib/forecast-opex";
import { irrAtYear, moicAtYear } from "@/lib/portfolio";
import saved from "./fixtures/saved-scenarios-baseline.json";
import type { Assumptions } from "@/financialEngine";

const calculate = (a: Assumptions) => {
  const value = safeCalculate(a);
  if (!value.result) throw Error(value.error!);
  return value.result;
};
export const comparisonProject = {
  id: "p1",
  name: "Mountain",
  status: "active",
  organization_id: "org",
} as ProjectRow;
export const comparisonScenario = {
  id: "s1",
  project_id: "p1",
  name: "Base Case",
  kind: "base",
  organization_id: "org",
} as ScenarioRow;

it.each([3, 8, 10])(
  "standardizes a saved exit of Year %s to the independent Year 8 reference",
  (exitYear) => {
    const a = phase1Case({ years: 12, exitYear });
    const before = structuredClone(a),
      r = calculate(a),
      originalResult = structuredClone(r);
    const p = projectComparison(a, r);
    expect(p.summary.passengers).toBe(100);
    expect(p.summary.revenue).toBe(300);
    expect(p.summary.ebitda).toBe(200);
    expect(p.summary.revenuePerPassenger).toBe(3);
    expect(p.summary.ebitdaPerPassenger).toBe(2);
    expect(p.summary.enterpriseValue).toBe(1000);
    expect(p.summary.exitEquityValue).toBeCloseTo(1430.4, 10);
    expect(p.summary.moic).toBeCloseTo(3.576, 10);
    expect(p.summary.irr).toBeCloseTo(3.576 ** (1 / 8) - 1, 9);
    expect(p.summary.irr).toBe(irrAtYear(a, r));
    expect(p.summary.moic).toBe(moicAtYear(a, r));
    expect(a).toEqual(before);
    expect(r).toEqual(originalResult);
  },
);

it("keeps the gross adult input distinct from weighted net output after growth, VAT and commission", () => {
  const a = phase1Case({
    priceGrowth: [0.1],
    segments: [
      {
        name: "Adult roundtrip",
        share: 0.5,
        grossPrice: 112,
        vatRate: 0.12,
        commission: 0,
        boardingsPerGuest: 2,
      },
      {
        name: "Cruise",
        share: 0.5,
        grossPrice: 112,
        vatRate: 0.12,
        commission: 0.2,
        boardingsPerGuest: 2,
      },
    ],
  });
  const before = structuredClone(a),
    r = calculate(a),
    p = projectComparison(a, r);
  expect(p.grossAdultFare).toBe(112);
  expect(p.summary.ticketNetPrice).toBeCloseTo(108.9, 10);
  expect(p.summary.ticketNetPrice).toBe(r.rows[2]!.ticketNetPrice);
  expect(a).toEqual(before);
});

it.each([1, 2, 3, 7])(
  "does not extend a %s-year horizon or invent unavailable KPI values",
  (years) => {
    const a = phase1Case({ years, exitYear: 1 });
    const r = calculate(a),
      p = projectComparison(a, r);
    expect(p.annual).toHaveLength(years);
    expect(p.summary.revenue).toBe(years < 3 ? null : 300);
    expect(p.summary.irr).toBeNull();
    expect(p.summary.moic).toBeNull();
    expect(p.summary.enterpriseValue).toBeNull();
    expect(p.summary.exitEquityValue).toBeNull();
    expect(p.year8Error).toContain("outside");
    expect(a.years).toBe(years);
    expect(OPERATING_YEARS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  },
);
it("returns null per-passenger economics at zero volume", () => {
  const a = phase1Case({ initialPassengers: 0 }),
    p = projectComparison(a, calculate(a));
  expect(p.summary.passengers).toBe(0);
  expect(p.summary.revenuePerPassenger).toBeNull();
  expect(p.summary.ebitdaPerPassenger).toBeNull();
  expect(p.summary.margin).toBeNull();
});
it.each([false, true])(
  "reconciles detailed expense and revenues with Advanced Operations enabled=%s",
  (enabled) => {
    const a: AssumptionsWithAdvanced = phase1Case({
      years: 10,
      exitYear: 3,
      fbRevenueYear1: 30,
      fbOpexYear1: 10,
      passengerGrowth: [0.02],
      opexGrowth: { fb: [0.025] },
      cableVariableCostPerPassenger: 0.2,
    });
    a.advanced = { operations: { enabled, inputs: defaultOperationsInputs(a) as never } };
    const before = structuredClone(a),
      r = calculate(a),
      p = projectComparison(a, r);
    p.annual.forEach((x, i) => {
      const costs = forecastOpex(a, r.rows[i]!);
      expect(x.values.fbOpex).toBe(costs.fb);
      expect(x.values.cableOpex).toBe(costs.cableFixed + costs.cableVariable);
      expect(x.values.cableOpex + x.values.fbOpex + costs.merchandise + costs.other).toBeCloseTo(
        r.rows[i]!.opex,
        10,
      );
      expect(x.values.revenue).toBe(r.rows[i]!.revenue);
    });
    expect(a).toEqual(before);
  },
);
it("uses resolved demand, CAPEX and commercial output without persisting replacement inputs", () => {
  const a: AssumptionsWithAdvanced = phase1Case({ years: 10 });
  const demand = defaultDemandInputs(a);
  demand.sources.at(-1)!.market = 200;
  const capex = defaultCapexInputs(a);
  capex.categories.find((c) => c.name === "Other development costs")!.baseCost = 2000;
  a.advanced = {
    demand: { enabled: true, inputs: demand as never },
    capex: { enabled: true, inputs: capex as never },
    commercialFb: {
      enabled: true,
      inputs: { conversion: 0.5, conversionChange: [], spend: 2, spendGrowth: [] },
    },
  };
  const before = structuredClone(a),
    r = calculate(a),
    p = projectComparison(a, r);
  expect(p.summary.passengers).toBe(200);
  expect(p.summary.capex).toBe(2000);
  expect(p.annual[0]!.values.fbRevenue).toBe(200);
  expect(a).toEqual(before);
});
it.each(saved.map((x, i) => ({ id: i, a: x.assumptions as unknown as Assumptions })))(
  "retains all annual engine outputs for saved fixture $id",
  ({ a }) => {
    const before = structuredClone(a),
      r = calculate(a),
      p = projectComparison(a, r);
    p.annual.forEach((x, i) => {
      expect(x.values.passengers).toBe(r.rows[i]!.passengers);
      expect(x.values.ticketNetPrice).toBe(r.rows[i]!.ticketNetPrice);
    });
    expect(a).toEqual(before);
  },
);

describe("selection provenance and errors", () => {
  const latest = (a = phase1Case()) => new Map([["s1", { version: 17, assumptions: a }]]);
  it("defaults to Base and carries the exact saved version", () => {
    const selected = selectComparison(
      ["p1"],
      new Map(),
      [comparisonProject],
      [comparisonScenario],
      latest(),
    );
    expect(selected[0]!.scenario?.id).toBe("s1");
    expect(selected[0]!.version).toBe(17);
    expect(validComparisonEntries(selected)[0]!.version).toBe(17);
  });
  it("keeps an explicitly chosen scenario and its version", () => {
    const other = { ...comparisonScenario, id: "s2", kind: "optimistic", name: "Upside" };
    const versions = latest();
    versions.set("s2", { version: 4, assumptions: phase1Case({ exitYear: 3 }) });
    const selected = selectComparison(
      ["p1"],
      new Map([["p1", "s2"]]),
      [comparisonProject],
      [comparisonScenario, other],
      versions,
    );
    expect(selected[0]!.scenario?.id).toBe("s2");
    expect(selected[0]!.version).toBe(4);
    expect(selected[0]!.a?.exitYear).toBe(3);
  });
  it("retains invalid scenarios with their identity and calculation error", () => {
    const selected = selectComparison(
      ["p1"],
      new Map(),
      [comparisonProject],
      [comparisonScenario],
      latest(phase1Case({ loanYears: 0 })),
    );
    expect(selected).toHaveLength(1);
    expect(selected[0]!.version).toBe(17);
    expect(selected[0]!.result).toBeNull();
    expect(selected[0]!.error).toContain("Loan tenor");
    expect(validComparisonEntries(selected)).toEqual([]);
    expect(projectSelections(selected)[0]!.projection).toBeNull();
  });
  it("does not fall back to Base when an explicit selection is missing or belongs to another project", () => {
    const selected = selectComparison(
      ["p1"],
      new Map([["p1", "wrong"]]),
      [comparisonProject],
      [comparisonScenario, { ...comparisonScenario, id: "wrong", project_id: "p2" }],
      latest(),
    );
    expect(selected[0]!.scenario).toBeNull();
    expect(selected[0]!.error).toContain("not substituted");
  });
  it("does not substitute another scenario for a Base Case without assumptions", () => {
    const selected = selectComparison(
      ["p1"],
      new Map(),
      [comparisonProject],
      [comparisonScenario],
      new Map(),
    );
    expect(selected[0]!.error).toContain("No saved assumptions");
    expect(selected[0]!.version).toBeNull();
  });
  it("keeps unavailable projects visible and removes duplicate URL IDs", () => {
    const selected = selectComparison(["gone", "gone"], new Map(), [], [], latest());
    expect(selected).toHaveLength(1);
    expect(selected[0]!.error).toContain("unavailable");
  });
});
describe("CSV metric contracts", () => {
  it.each([
    [25000000, "millions", 25],
    [0.25, "percent", 25],
    [123.45, "nok", 123.45],
    [3.576, "multiple", 3.576],
    [0, "count", 0],
  ] as const)("exports %s as %s units", (v, u, expected) =>
    expect(comparisonCsvValue(v, u)).toBe(expected),
  );
  it("exports unavailable/nonfinite values as N/A", () => {
    expect(comparisonCsvValue(null, "nok")).toBe("N/A");
    expect(comparisonCsvValue(Infinity, "millions")).toBe("N/A");
  });
  it("has explicit Year 3 and hypothetical Year 8 labels, and keeps initial CAPEX out of annual metrics", () => {
    expect(SUMMARY_METRICS.filter((m) => m.label.includes("Hypothetical Year 8"))).toHaveLength(4);
    expect(SUMMARY_METRICS.find((m) => m.key === "capex")!.unit).toBe("millions");
    expect(ANNUAL_METRICS).toHaveLength(7);
    expect(ANNUAL_METRICS.some((m) => (m.key as string) === "capex")).toBe(false);
  });
  it("quotes names, separates fields and protects text spreadsheet formulas", () => {
    expect(
      comparisonCsv([
        ["Project", "CAPEX (NOK million)"],
        ['A "quoted" project', 25],
        ["=HYPERLINK()", 0],
      ]),
    ).toContain('"A ""quoted"" project";"25"');
    expect(comparisonCsv([["=HYPERLINK()"]])).toContain("'=HYPERLINK()");
  });
});

it("does not replace a malformed empty explicit scenario selection with Base", () => {
  const selected = selectComparison(
    ["p1"],
    new Map([["p1", ""]]),
    [comparisonProject],
    [comparisonScenario],
    new Map([["s1", { version: 1, assumptions: phase1Case() }]]),
  );
  expect(selected[0]!.scenario).toBeNull();
  expect(selected[0]!.result).toBeNull();
  expect(selected[0]!.error).toContain("not substituted");
});
it("preserves a saved nondefault financing split in hypothetical analysis", () => {
  const a = phase1Case({ debtShare: 0.35, exitYear: 3 });
  const r = calculate(a);
  projectComparison(a, r);
  expect(a.debtShare).toBe(0.35);
  expect(r.debt).toBe(350);
  expect(r.equity).toBe(650);
});
