import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Assumptions } from "@/financialEngine";
import { safeCalculate } from "@/lib/model";
import { irrAtYear, moicAtYear } from "@/lib/portfolio";
import { defaultDemandInputs } from "@/lib/advanced-demand";
import { defaultCapexInputs } from "@/lib/advanced-capex";
import { defaultOperationsInputs } from "@/lib/advanced-operations";
import type { AssumptionsWithAdvanced } from "@/lib/advanced";
import type { VolumeLine } from "@/lib/volume-methods";
import { phase1Case } from "./fixtures/phase1";
import golden from "./fixtures/phase1-compatibility-baseline.json";
import saved from "./fixtures/saved-scenarios-baseline.json";
import investments from "./fixtures/production-investments.json";

function run(a: Assumptions) {
  const original = structuredClone(a);
  const value = safeCalculate(a);
  expect(a).toEqual(original);
  if (!value.result) throw Error(value.error ?? "Calculation failed");
  return value.result;
}
function operations(a = phase1Case()): AssumptionsWithAdvanced {
  return {
    ...a,
    advanced: { operations: { enabled: true, inputs: defaultOperationsInputs(a) as never } },
  };
}

describe("Phase 1 signed CAPEX adjustments", () => {
  it.each([
    { name: "supplier rebate", quantity: 1, unitCost: -100 },
    { name: "returned quantity credit", quantity: -1, unitCost: 100 },
  ])("accepts $name without changing the original lines", (credit) => {
    const a = phase1Case({
      capexItems: [{ name: "Equipment", quantity: 1, unitCost: 1000 }, credit],
    });
    const r = run(a);
    expect([r.capex, r.debt, r.equity]).toEqual([900, 540, 360]);
    expect(r.rows[2]!.ebitda).toBe(200);
    expect(r.rows[0]!.cashAfterDebt).toBeCloseTo(62.8, 10);
    expect(r.exitEquityValue).toBeCloseTo(1515.36, 10);
    expect(r.equityMultiple).toBeCloseTo(1515.36 / 360, 10);
    expect(r).toEqual(
      run(phase1Case({ capexItems: [{ name: "Net equipment", quantity: 1, unitCost: 900 }] })),
    );
  });
  it("allows a fully credited zero investment", () => {
    const r = run(
      phase1Case({
        capexItems: [
          { name: "Equipment", quantity: 1, unitCost: 1000 },
          { name: "Credit", quantity: 1, unitCost: -1000 },
        ],
      }),
    );
    expect([r.capex, r.debt, r.equity]).toEqual([0, 0, 0]);
    expect(r.equityMultiple).toBeNull();
  });
  it.each([-1001, -1100])(
    "rejects a credit of %s that makes total investment negative",
    (unitCost) => {
      expect(
        safeCalculate(
          phase1Case({
            contingencyRate: 0.1,
            capexItems: [
              { name: "Equipment", quantity: 1, unitCost: 1000 },
              { name: "Credit", quantity: 1, unitCost },
            ],
          }),
        ).result,
      ).toBeNull();
    },
  );
  it.each([NaN, Infinity, -Infinity])("rejects a nonfinite adjustment %s", (unitCost) => {
    expect(
      safeCalculate(
        phase1Case({
          capexItems: [
            { name: "Equipment", quantity: 1, unitCost: 1000 },
            { name: "Credit", quantity: 1, unitCost },
          ],
        }),
      ).result,
    ).toBeNull();
  });
});

describe("Phase 1 controlling calculation methods", () => {
  it.each([-1, NaN, Infinity])(
    "ignores inactive standard cable costs (%s) with Advanced Operations",
    (stale) => {
      const clean = operations();
      expect(
        run({ ...clean, cableFixedOpex: stale, cableVariableCostPerPassenger: stale }),
      ).toEqual(run(clean));
    },
  );
  it("validates standard costs again when Advanced Operations is disabled", () => {
    const a = operations();
    a.cableFixedOpex = -1;
    a.advanced!.operations!.enabled = false;
    expect(safeCalculate(a).result).toBeNull();
  });
  it("ignores inactive category inputs within a fixed Advanced Operations category", () => {
    const clean = operations();
    const stale = structuredClone(clean);
    const inputs = stale.advanced!.operations!.inputs as unknown as ReturnType<
      typeof defaultOperationsInputs
    >;
    const c = inputs.categories[0]!;
    c.method = "fixed";
    c.variable = NaN;
    c.step.base = -100;
    c.step.threshold = NaN;
    c.step.maxSteps = -1;
    expect(run(stale)).toEqual(run(clean));
  });
  it("still rejects invalid active Advanced Operations amounts", () => {
    const a = operations();
    const inputs = a.advanced!.operations!.inputs as unknown as ReturnType<
      typeof defaultOperationsInputs
    >;
    inputs.categories[0]!.fixed = -1;
    expect(safeCalculate(a).result).toBeNull();
  });

  const revenues: VolumeLine[] = [
    { method: "annual", annualAmount: 20 },
    { method: "perPassenger", perPassenger: 0.2 },
    { method: "perPassengerSeries", perPassengerByYear: [0.2] },
  ];
  it.each(revenues)("ignores inactive manual revenue and OPEX for $method revenue", (revenue) => {
    const clean = phase1Case({
      volumeMethods: {
        fb: { revenue, opex: { method: "annual", annualAmount: 5 } },
        merch: {
          revenue,
          opex: { method: "fixedVariable", fixedAmount: 3, variablePerPassenger: 0.02 },
        },
      },
    });
    for (const stale of [-1, NaN, Infinity]) {
      expect(
        run({
          ...clean,
          fbRevenueYear1: stale,
          fbOpexYear1: stale,
          merchRevenueYear1: stale,
          merchOpexYear1: stale,
          merchOpexRate: stale,
        }),
      ).toEqual(run(clean));
    }
  });
  it("uses a frozen benchmark instead of inactive manual F&B amounts", () => {
    const source = (historicalAmount: number) => ({
      assetId: "local-fixture",
      year: 2025,
      snapshot: { historicalAmount, manualAdjustment: 0, cableCarPassengers: 100 },
    });
    const clean = phase1Case({
      fbBenchmark: { adjust: false, revenue: source(20), opex: source(5) } as never,
      volumeMethods: { fb: { revenue: { method: "benchmark" }, opex: { method: "benchmark" } } },
    });
    expect(run({ ...clean, fbRevenueYear1: NaN, fbOpexYear1: -1 })).toEqual(run(clean));
    expect(run(clean).rows[0]!.fbRevenue).toBe(20);
  });
  it("validates the manual benchmark fallback when a snapshot is absent", () => {
    expect(
      safeCalculate(
        phase1Case({
          fbRevenueYear1: -1,
          volumeMethods: { fb: { revenue: { method: "benchmark" } } },
        }),
      ).result,
    ).toBeNull();
  });
  it("validates a bad active benchmark amount", () => {
    expect(
      safeCalculate(
        phase1Case({
          fbBenchmark: {
            adjust: false,
            revenue: {
              assetId: "local-fixture",
              year: 2025,
              snapshot: { historicalAmount: -20, manualAdjustment: 0 },
            },
          } as never,
          volumeMethods: { fb: { revenue: { method: "benchmark" } } },
        }),
      ).result,
    ).toBeNull();
  });
  it("retains a manual revenue basis when legacy OPEX actually depends on it", () => {
    const a = phase1Case({
      fbRevenueYear1: 100,
      fbOpexYear1: 10,
      volumeMethods: { fb: { revenue: { method: "annual", annualAmount: 30 } } },
    });
    expect(run(a).rows[0]!.fbOpex).toBe(3);
    expect(safeCalculate({ ...a, fbRevenueYear1: Infinity }).result).toBeNull();
  });
  it("allows an inactive manual revenue sentinel when explicit revenue and fixed legacy costs control outputs", () => {
    const a = phase1Case({
      fbRevenueYear1: -1,
      fbOpexYear1: 10,
      opexGrowth: { fb: [0] },
      volumeMethods: { fb: { revenue: { method: "annual", annualAmount: 30 } } },
    });
    expect(run(a).rows[0]!.fbOpex).toBe(10);
  });
  it("uses the active merchandise revenue percentage instead of manual OPEX and its growth", () => {
    const clean = phase1Case({
      merchOpexRate: 0.4,
      volumeMethods: { merch: { revenue: { method: "annual", annualAmount: 20 } } },
    });
    expect(run({ ...clean, merchOpexYear1: NaN, opexGrowth: { merch: [NaN] } })).toEqual(
      run(clean),
    );
    expect(run(clean).rows[0]!.merchOpex).toBe(8);
  });
  it("ignores cost growth lists for percentage-of-revenue OPEX", () => {
    const clean = phase1Case({
      volumeMethods: {
        fb: { revenue: revenues[0]!, opex: { method: "revenuePercent", revenuePercent: 0.25 } },
        merch: { revenue: revenues[0]!, opex: { method: "revenuePercent", revenuePercent: 0.25 } },
      },
    });
    expect(run({ ...clean, opexGrowth: { fb: [-2], merch: [NaN] } })).toEqual(run(clean));
  });
  it("ignores ancillary growth when both revenues use explicit per-passenger series", () => {
    const clean = phase1Case({
      volumeMethods: {
        fb: { revenue: revenues[2]!, opex: { method: "annual", annualAmount: 5 } },
        merch: { revenue: revenues[2]!, opex: { method: "annual", annualAmount: 5 } },
      },
    });
    expect(run({ ...clean, ancillaryGrowth: [NaN] })).toEqual(run(clean));
  });
  it("ignores fallback cost inflation when all selected costs use explicit growth", () => {
    const clean = phase1Case({ opexGrowth: { cable: [0], fb: [0], merch: [0] } });
    expect(run({ ...clean, costInflation: NaN })).toEqual(run(clean));
  });
  it("keeps cable growth active for maintenance CAPEX even with module-specific operations inflation", () => {
    const a = operations();
    const inputs = a.advanced!.operations!.inputs as unknown as ReturnType<
      typeof defaultOperationsInputs
    >;
    inputs.inflation = 0;
    expect(safeCalculate({ ...a, opexGrowth: { cable: [-2] } }).result).toBeNull();
  });
  it("does not use standard cable growth when operations has its own rate and maintenance is disabled", () => {
    const clean = operations(phase1Case({ maintenanceCapexPct: 0 }));
    (
      clean.advanced!.operations!.inputs as unknown as ReturnType<typeof defaultOperationsInputs>
    ).inflation = 0;
    expect(run({ ...clean, opexGrowth: { cable: [NaN] } })).toEqual(run(clean));
  });
  it.each<VolumeLine>([
    { method: "annual", annualAmount: 5 },
    { method: "perPassenger", perPassenger: 0.05 },
    { method: "fixedVariable", fixedAmount: 3, variablePerPassenger: 0.02 },
    { method: "revenuePercent", revenuePercent: 0.25 },
  ])("validates only selected $method OPEX amounts", (opex) => {
    const clean = phase1Case({
      volumeMethods: {
        fb: { revenue: { method: "annual", annualAmount: 20 }, opex },
        merch: { revenue: { method: "annual", annualAmount: 20 }, opex },
      },
    });
    const stale = { ...clean, fbOpexYear1: NaN, merchOpexYear1: -1, merchOpexRate: NaN };
    expect(run(stale)).toEqual(run(clean));
    const bad = {
      ...opex,
      annualAmount: -1,
      perPassenger: -1,
      fixedAmount: -1,
      variablePerPassenger: -1,
      revenuePercent: -1,
    };
    expect(
      safeCalculate({ ...clean, volumeMethods: { fb: { ...clean.volumeMethods!.fb, opex: bad } } })
        .result,
    ).toBeNull();
  });
  it("resolves Advanced Demand and Detailed CAPEX before validating replaced standard inputs", () => {
    const clean = phase1Case();
    const active: AssumptionsWithAdvanced = {
      ...clean,
      advanced: {
        demand: { enabled: true, inputs: defaultDemandInputs(clean) as never },
        capex: { enabled: true, inputs: defaultCapexInputs(clean) as never },
      },
    };
    const stale = {
      ...active,
      initialPassengers: -1,
      passengerGrowth: [NaN],
      capexItems: [{ name: "Inactive", quantity: 1, unitCost: NaN }],
      contingencyRate: -1,
    };
    expect(run(stale)).toEqual(run(active));
  });
  it("validates manual revenue again when its explicit override is removed", () => {
    const a = phase1Case({ fbRevenueYear1: -1 });
    expect(safeCalculate(a).result).toBeNull();
    expect(
      run({
        ...a,
        opexGrowth: { fb: [0] },
        volumeMethods: { fb: { revenue: { method: "annual", annualAmount: 20 } } },
      }).rows[0]!.fbRevenue,
    ).toBe(20);
  });
  it("still rejects invalid amounts in the selected explicit revenue method", () => {
    expect(
      safeCalculate(
        phase1Case({ volumeMethods: { fb: { revenue: { method: "annual", annualAmount: -20 } } } }),
      ).result,
    ).toBeNull();
  });
});

describe("Phase 1 pre-compatibility financial output protection", () => {
  const cases = [
    ...saved.map((x, i) => ({ id: `saved-${i}`, a: x.assumptions as unknown as Assumptions })),
    ...Object.entries(investments).map(([id, a]) => ({
      id: `investment-${id}`,
      a: a as unknown as Assumptions,
    })),
  ];
  it.each(cases)(
    "preserves all outputs, Year 3/8 metrics and equity flows for $id",
    ({ id, a }) => {
      const expected = golden.find((x) => x.id === id)!;
      const r = run(a);
      expect(createHash("sha256").update(JSON.stringify(r)).digest("hex")).toBe(
        expected.engineSha256,
      );
      expect(r.rows[2]?.ebitda ?? null).toBe(expected.ebitdaY3);
      expect(irrAtYear(a, r)).toBe(expected.irrY8);
      expect(moicAtYear(a, r)).toBe(expected.moicY8);
      expect(r.cashflows).toEqual(expected.equityCashflows);
    },
  );
});
