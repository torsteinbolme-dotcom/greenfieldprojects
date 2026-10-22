import { describe, expect, it } from "vitest";
import { calculate, type Assumptions } from "@/financialEngine";
import { safeCalculate } from "@/lib/model";
import { phase1Case } from "./fixtures/phase1";

describe("Phase 1 rejects invalid financial inputs without rewriting them", () => {
  const cases: [string, Partial<Assumptions>][] = [
    ["fractional loan tenor", { loanYears: 1.5 }],
    ["zero loan tenor", { loanYears: 0 }],
    ["NaN loan tenor", { loanYears: NaN }],
    ["infinite passengers", { initialPassengers: Infinity }],
    ["negative passengers", { initialPassengers: -1 }],
    ["negative passenger forecast", { passengerGrowth: [-1.01] }],
    ["nonfinite growth", { priceGrowth: [NaN] }],
    ["negative OPEX", { cableFixedOpex: -1 }],
    ["negative variable OPEX", { cableVariableCostPerPassenger: -1 }],
    ["negative restaurant OPEX", { fbOpexYear1: -1 }],
    ["negative merchandise OPEX", { merchOpexYear1: -1 }],
    ["negative CAPEX", { capexItems: [{ name: "Invalid", quantity: 1, unitCost: -1 }] }],
    ["negative quantity", { capexItems: [{ name: "Invalid", quantity: -1, unitCost: 1 }] }],
    ["negative maintenance", { maintenanceCapexPct: -0.01 }],
    ["infinite maintenance", { maintenanceCapexPct: Infinity }],
    ["invalid cost inflation", { costInflation: -1.01 }],
    ["invalid cost growth", { opexGrowth: { fb: [-1.01] } }],
    ["negative merchandise cost share", { merchOpexRate: -0.1 }],
    ["zero depreciation life", { depreciationYears: 0 }],
    ["fractional horizon", { years: 8.5 }],
    ["fractional exit year", { exitYear: 1.5 }],
    ["invalid debt share", { debtShare: NaN }],
    ["invalid tax", { taxRate: 1.1 }],
    ["negative contingency", { contingencyRate: -0.1 }],
    [
      "negative price",
      {
        segments: [
          {
            name: "Invalid",
            share: 1,
            grossPrice: -1,
            vatRate: 0,
            commission: 0,
            boardingsPerGuest: 1,
          },
        ],
      },
    ],
    [
      "negative segment share",
      {
        segments: [
          {
            name: "A",
            share: -0.1,
            grossPrice: 1,
            vatRate: 0,
            commission: 0,
            boardingsPerGuest: 1,
          },
          { name: "B", share: 1.1, grossPrice: 1, vatRate: 0, commission: 0, boardingsPerGuest: 1 },
        ],
      },
    ],
    [
      "nonfinite segment price",
      {
        segments: [
          { name: "A", share: 1, grossPrice: NaN, vatRate: 0, commission: 0, boardingsPerGuest: 1 },
        ],
      },
    ],
  ];
  it.each(cases)("%s", (_name, patch) => {
    const a = phase1Case(patch),
      original = structuredClone(a);
    expect(() => calculate(a)).toThrow();
    const result = safeCalculate(a);
    expect(result.result).toBeNull();
    expect(result.error).toBeTruthy();
    expect(a).toEqual(original);
  });
  it("rejects finite inputs whose arithmetic overflows", () => {
    const a = phase1Case({ initialPassengers: Number.MAX_VALUE });
    expect(() => calculate(a)).toThrow(/finite/i);
  });
  it("allows zero volume, a 100% decline, cost reductions and zero CAPEX", () => {
    for (const patch of [
      { initialPassengers: 0 },
      { passengerGrowth: [-1] },
      { costInflation: -0.1 },
      { capexItems: [] },
    ]) {
      expect(() => calculate(phase1Case(patch))).not.toThrow();
    }
  });
});
