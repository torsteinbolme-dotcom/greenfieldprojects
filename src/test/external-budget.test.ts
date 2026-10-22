import { describe, expect, it } from "vitest";
import { calculate, type Assumptions } from "@/financialEngine";
import {
  captureInheritance,
  calculateExternalBudget,
  calculateFinancialInput,
} from "@/lib/financial-input";
import {
  ACCOUNTING_CONFIRMATIONS,
  FINANCIAL_INPUT_VERSION,
  type ExternalBudgetInput,
  type ExternalBudgetDraft,
} from "@/lib/external-budget-contract";
import { forecastExpenseBreakdown, forecastOpex } from "@/lib/forecast-opex";
import { unitEconomics } from "@/lib/unit-economics";
import { projectComparison } from "@/lib/comparison-projection";
import { safeCalculate } from "@/lib/model";
import { phase1Case } from "./fixtures/phase1";
import saved from "./fixtures/saved-scenarios-baseline.json";

function budget(source = phase1Case()): ExternalBudgetInput {
  return {
    version: FINANCIAL_INPUT_VERSION,
    mode: "externalBudget",
    status: "complete",
    initialCapex: 1000,
    inheritance: captureInheritance(source),
    accounting: {
      ticketAlreadyNet: true,
      cableExcludesSeparateCosts: true,
      opexExcludesFinancingTaxDepreciation: true,
      replacementCapexNotDoubleCounted: true,
      capexIncludesContingency: true,
    },
    annual: Array.from({ length: 10 }, (_, i) => ({
      year: i + 1,
      passengers: 100,
      ticketNetPrice: 3,
      fbRevenue: 0,
      fbOpex: 0,
      cableOpex: 100,
    })),
  };
}
function altered(
  input: ExternalBudgetInput,
  update: (value: {
    annual: Record<string, unknown>[];
    accounting: Record<string, unknown>;
    inheritance: { [key: string]: unknown; volumeMethods: Record<string, unknown> };
    version: unknown;
  }) => void,
): ExternalBudgetInput {
  const clone = structuredClone(input);
  update(clone as unknown as Parameters<typeof update>[0]);
  return clone;
}

// Literal NOK references, independently derived in the test comments, not another engine.
describe("External annual financial inputs", () => {
  it("matches independent Year 3, Year 8 and unlevered return references", () => {
    const input = budget();
    const { result: r, comparison: c, projectReturns: p } = calculateExternalBudget(input);
    expect([r.capex, r.debt, r.equity]).toEqual([1000, 600, 400]);
    expect(r.rows).toHaveLength(10);
    expect(c.summary).toMatchObject({
      passengers: 100,
      revenue: 300,
      ebitda: 200,
      margin: 2 / 3,
      revenuePerPassenger: 3,
      ebitdaPerPassenger: 2,
      ticketNetPrice: 3,
      enterpriseValue: 1000,
      exitEquityValue: 1430.4,
    });
    expect(c.summary.moic).toBeCloseTo(3.576, 12);
    expect(c.summary.irr).toBeCloseTo(3.576 ** (1 / 8) - 1, 9);
    expect(r.cashflows).toEqual([-400, 0, 0, 0, 0, 0, 0, 0, 1430.4]);
    expect(p.fcf).toEqual(Array(10).fill(160));
    expect(p.flows).toEqual([-1000, 160, 160, 160, 160, 160, 160, 160, 1160]);
    expect(p.projectIrr).toBeCloseTo(0.16, 9);
    expect(c.grossAdultFare).toBeNull();
    expect(r.weightedTicket).toBe(3);
  });

  it("keeps all annual figures exact with zero-to-positive recovery and no second deductions", () => {
    const source = phase1Case({
      initialPassengers: 999,
      passengerGrowth: [9],
      priceGrowth: [9],
      contingencyRate: 0.5,
      fbRevenueYear1: 999,
      fbOpexYear1: 999,
      fbFollowsPassengers: true,
      segments: [
        {
          name: "Source",
          share: 1,
          grossPrice: 100,
          vatRate: 0.25,
          commission: 0.3,
          boardingsPerGuest: 2,
        },
      ],
      opexGrowth: { fb: [9], cable: [0] },
      costInflation: 0,
    });
    const input = budget(source);
    const annual = input.annual.map((row, i) => ({
      ...row,
      passengers: i === 0 ? 0 : 10 + i,
      ticketNetPrice: 7 + i,
      fbRevenue: 20 + i,
      fbOpex: 5 + i,
      cableOpex: 40 + i,
    }));
    const out = calculateExternalBudget({ ...input, initialCapex: 200, annual });
    expect(out.result.capex).toBe(200);
    expect([out.result.debt, out.result.equity]).toEqual([120, 80]);
    out.result.rows.forEach((row, i) => {
      const value = annual[i]!;
      expect([row.passengers, row.ticketNetPrice, row.fbRevenue, row.fbOpex]).toEqual([
        value.passengers,
        value.ticketNetPrice,
        value.fbRevenue,
        value.fbOpex,
      ]);
      expect(row.ticketRevenue).toBe(value.passengers * value.ticketNetPrice);
      expect(row.revenue).toBe(value.passengers * value.ticketNetPrice + value.fbRevenue);
      expect(row.opex).toBe(value.cableOpex + value.fbOpex);
      expect(row.maintenanceCapex).toBe(4);
    });
    expect(out.comparison.annual[0]!.values.cableOpex).toBe(40);
    expect(out.result.rows[0]!.ticketRevenue).toBe(0);
    expect(out.result.rows[1]!.ticketRevenue).toBe(88);
  });

  it("uses inherited methods against external volumes and corresponding revenues", () => {
    const source = phase1Case({
      ancillaryGrowth: [0.1],
      costInflation: 0.2,
      opexGrowth: { cable: [0.1] },
      volumeMethods: {
        merch: {
          revenue: { method: "perPassenger", perPassenger: 2 },
          opex: { method: "revenuePercent", revenuePercent: 0.25 },
        },
        other: {
          revenue: { method: "annual", annualAmount: 10 },
          opex: { method: "fixedVariable", fixedAmount: 3, variablePerPassenger: 0.5 },
        },
      },
    });
    const input = budget(source);
    const cases = [
      { passengers: 0, ticketNetPrice: 9, fbRevenue: 7, fbOpex: 4, cableOpex: 19 },
      { passengers: 20, ticketNetPrice: 4, fbRevenue: 30, fbOpex: 11, cableOpex: 70 },
      { passengers: 10, ticketNetPrice: 5, fbRevenue: 8, fbOpex: 3, cableOpex: 27 },
    ];
    const r = calculateExternalBudget({
      ...input,
      annual: input.annual.map((row, i) => ({ ...row, ...cases[i] })),
    }).result;
    const references = [
      [0, 10, 0, 3, 17, 26, -9, 20],
      [44, 11, 11, 15.6, 165, 107.6, 57.4, 22],
      [24.2, 12.1, 6.05, 11.52, 94.3, 47.57, 46.73, 24.2],
    ];
    references.forEach((expected, i) => {
      const row = r.rows[i]!;
      [
        row.merchRevenue,
        row.otherRevenue,
        row.merchOpex,
        row.otherOpex,
        row.revenue,
        row.opex,
        row.ebitda,
        row.maintenanceCapex,
      ].forEach((v, j) => expect(v).toBeCloseTo(expected[j]!, 10));
    });
  });

  it("carries debt, losses, depreciation, funding and cash continuously across ten years", () => {
    // CAPEX 100: debt 60, equity 40. Principal 20 for three years, depreciation 50 for two.
    // Tax losses: 106 after Y1, 110 after Y2; Y3 taxable 148 offsets 110 => tax 9.5.
    // Unlevered loss: 100, offset in Y3 => unlevered tax 12.5 (not levered tax 9.5).
    const input = budget(
      phase1Case({
        loanYears: 3,
        depreciationYears: 2,
        taxRate: 0.25,
        exitTransactionCostRate: 0.1,
      }),
    );
    const { result: r, projectReturns: p } = calculateExternalBudget({
      ...input,
      initialCapex: 100,
      annual: input.annual.map((row, i) => ({
        ...row,
        passengers: [0, 10, 20][i] ?? 10,
        ticketNetPrice: 10,
        cableOpex: 50,
      })),
    });
    expect(r.rows.map((row) => row.interest)).toEqual([6, 4, 2, 0, 0, 0, 0, 0, 0, 0]);
    expect(r.rows.map((row) => row.principal)).toEqual([20, 20, 20, 0, 0, 0, 0, 0, 0, 0]);
    expect(r.rows.map((row) => row.depreciation)).toEqual([50, 50, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(r.rows.map((row) => row.tax)).toEqual([
      0, 0, 9.5, 12.5, 12.5, 12.5, 12.5, 12.5, 12.5, 12.5,
    ]);
    expect(r.rows.map((row) => row.retainedCash)).toEqual([
      0, 24, 140.5, 176, 211.5, 247, 282.5, 318, 353.5, 389,
    ]);
    expect(r.rows.map((row) => row.equityInjection)).toEqual([78, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(r.cashflows).toEqual([-40, -78, 0, 0, 0, 0, 0, 0, 543]);
    expect(r.totalEquityInvested).toBe(118);
    expect(r.enterpriseValue).toBe(250);
    expect(r.exitEquityValue).toBe(543);
    expect(r.equityMultiple).toBeCloseTo(543 / 118, 12);
    expect(r.equityIrr).toBeCloseTo(0.2303746243484633, 9);
    expect(p.fcf).toEqual([-52, 48, 135.5, 35.5, 35.5, 35.5, 35.5, 35.5, 35.5, 35.5]);
    expect(p.flows).toEqual([-100, -52, 48, 135.5, 35.5, 35.5, 35.5, 35.5, 260.5]);
    expect(p.projectIrr).toBeCloseTo(0.3381058306527698, 9);
  });

  it("respects annual distribution policy without counting Years 9–10 shareholder proceeds", () => {
    const input = budget(
      phase1Case({
        loanYears: 3,
        depreciationYears: 2,
        taxRate: 0.25,
        exitTransactionCostRate: 0.1,
        distributeCashAnnually: true,
      }),
    );
    const r = calculateExternalBudget({
      ...input,
      initialCapex: 100,
      annual: input.annual.map((row, i) => ({
        ...row,
        passengers: [0, 10, 20][i] ?? 10,
        ticketNetPrice: 10,
        cableOpex: 50,
      })),
    }).result;
    expect(r.rows.map((row) => row.retainedCash)).toEqual(Array(10).fill(0));
    expect(r.cashflows).toEqual([-40, -78, 24, 116.5, 35.5, 35.5, 35.5, 35.5, 260.5]);
    expect(r.exitEquityValue).toBe(225);
    expect(r.equityMultiple).toBeCloseTo(543 / 118, 12);
  });

  it("excludes later forecasts from all hypothetical Year 8 returns", () => {
    const input = budget();
    const before = calculateExternalBudget(input);
    const after = calculateExternalBudget({
      ...input,
      annual: input.annual.map((row, i) => (i < 8 ? row : { ...row, ticketNetPrice: 10000 })),
    });
    expect(after.result.cashflows).toEqual(before.result.cashflows);
    expect(after.comparison.summary).toEqual(before.comparison.summary);
    expect(after.projectReturns.flows).toEqual(before.projectReturns.flows);
    expect(after.result.rows[9]!.revenue).toBe(1000000);
  });

  it("reconciles expenses and represents the absent cable split honestly", () => {
    const source = phase1Case();
    const input = budget(source);
    const out = calculateExternalBudget(input);
    for (const row of out.result.rows) {
      const costs = forecastExpenseBreakdown(source, row);
      expect(costs).toEqual({
        source: "externalBudget",
        cableTotal: 100,
        cableFixed: null,
        cableVariable: null,
        fb: 0,
        merchandise: 0,
        other: 0,
      });
      expect(costs.cableTotal + costs.fb + costs.merchandise + costs.other).toBe(row.opex);
      expect(
        unitEconomics(source, row).items.find((item) => item.key === "cableOpex")!.annual,
      ).toBe(-100);
      expect(() => forecastOpex(source, row)).toThrow(/unavailable/);
    }
    const ordinary = calculate(source).rows[0]!;
    expect(forecastOpex(source, ordinary)).toEqual({
      cableFixed: 100,
      cableVariable: 0,
      fb: 0,
      merchandise: 0,
      other: 0,
    });
    expect(forecastExpenseBreakdown(source, ordinary).cableTotal).toBe(100);
  });

  it("keeps frozen inheritance independent from source edits or deletion", () => {
    const source = phase1Case({
      opexGrowth: { cable: [0.1] },
      volumeMethods: { merch: { revenue: { method: "perPassenger", perPassenger: 1 } } },
    });
    const original = structuredClone(source);
    const input = budget(source);
    const beforeInput = structuredClone(input);
    const before = calculateExternalBudget(input);
    expect(source).toEqual(original);
    expect(Object.isFrozen(input.inheritance)).toBe(true);
    expect(Object.isFrozen(input.inheritance.opexGrowth!.cable)).toBe(true);
    source.interestRate = 100;
    source.opexGrowth!.cable![0] = 100;
    source.volumeMethods!.merch!.revenue!.perPassenger = 100;
    delete source.volumeMethods;
    expect(calculateExternalBudget(input)).toEqual(before);
    expect(input).toEqual(beforeInput);
    expect(() => ((input.inheritance.opexGrowth!.cable as number[])[0] = 99)).toThrow();
  });

  it("uses Advanced Merchandise parameters with external annual passenger volumes", () => {
    const source = {
      ...phase1Case({ ancillaryGrowth: [9], years: 3 }),
      advanced: {
        commercialMerch: {
          enabled: true,
          inputs: { conversion: 0.5, conversionChange: [], spend: 4, spendGrowth: [0.1] },
        },
        demand: { enabled: true, inputs: {} },
        operations: { enabled: true, inputs: {} },
        capex: { enabled: true, inputs: {} },
        commercialFb: { enabled: true, inputs: {} },
      },
    };
    const before = structuredClone(source);
    const input = budget(source);
    const r = calculateExternalBudget({
      ...input,
      annual: input.annual.map((row, i) => ({ ...row, passengers: i === 0 ? 0 : 10 })),
    }).result;
    expect(r.rows[0]!.merchRevenue).toBe(0);
    expect(r.rows[1]!.merchRevenue).toBe(22);
    expect(r.rows[2]!.merchRevenue).toBeCloseTo(24.2, 12);
    expect(r.rows[9]!.merchRevenue).toBeCloseTo(47.15895382, 8);
    expect(source).toEqual(before);
  });

  it("retains inherited legacy merchandise revenue ratios and explicit cost growth", () => {
    const input = budget(
      phase1Case({
        merchRevenueYear1: 40,
        merchOpexYear1: 10,
        ancillaryGrowth: [0.5],
        opexGrowth: { merch: [0.2] },
      }),
    );
    const r = calculateExternalBudget(input).result;
    expect([r.rows[0]!.merchRevenue, r.rows[0]!.merchOpex]).toEqual([40, 10]);
    expect(r.rows[1]!.merchRevenue).toBe(60);
    expect(r.rows[1]!.merchOpex).toBe(18);
    expect(r.rows[2]!.merchOpex).toBeCloseTo(32.4, 12);
  });

  it("keeps external comparison returns independent of the source saved exit and balances", () => {
    const source = phase1Case({
      exitYear: 3,
      capexItems: [{ name: "Source", quantity: 1, unitCost: 9000 }],
    });
    const out = calculateExternalBudget(budget(source));
    expect(projectComparison({ ...source, exitMultiple: 99, debtShare: 1 }, out.result)).toEqual(
      out.comparison,
    );
  });

  it.each([
    {
      revenue: { method: "annual", annualAmount: 10 },
      opex: { method: "annual", annualAmount: 3 },
      revenueY2: 11,
      costY2: 3.6,
    },
    {
      revenue: { method: "perPassenger", perPassenger: 2 },
      opex: { method: "perPassenger", perPassenger: 0.5 },
      revenueY2: 44,
      costY2: 12,
    },
    {
      revenue: { method: "perPassengerSeries", perPassengerByYear: [2, 3] },
      opex: { method: "fixedVariable", fixedAmount: 2, variablePerPassenger: 0.5 },
      revenueY2: 60,
      costY2: 14.4,
    },
  ] as const)(
    "recalculates merchandise $revenue.method / $opex.method using external values",
    (value) => {
      const source = phase1Case({
        ancillaryGrowth: [0.1],
        opexGrowth: { merch: [0.2] },
        volumeMethods: {
          merch: structuredClone({
            revenue: value.revenue,
            opex: value.opex,
          }) as unknown as NonNullable<NonNullable<Assumptions["volumeMethods"]>["merch"]>,
        },
      });
      const input = budget(source);
      const r = calculateExternalBudget({
        ...input,
        annual: input.annual.map((row) => ({ ...row, passengers: 20 })),
      }).result;
      expect(r.rows[1]!.merchRevenue).toBeCloseTo(value.revenueY2, 12);
      expect(r.rows[1]!.merchOpex).toBeCloseTo(value.costY2, 12);
    },
  );

  it("recalculates other per-passenger revenue and percent OPEX without using ticket or F&B revenue", () => {
    const input = budget(
      phase1Case({
        ancillaryGrowth: [0.1],
        volumeMethods: {
          other: {
            revenue: { method: "perPassenger", perPassenger: 2 },
            opex: { method: "revenuePercent", revenuePercent: 0.5 },
          },
        },
      }),
    );
    const r = calculateExternalBudget({
      ...input,
      annual: input.annual.map((row) => ({ ...row, passengers: 20, fbRevenue: 500 })),
    }).result;
    expect(r.rows[1]!.otherRevenue).toBe(44);
    expect(r.rows[1]!.otherOpex).toBe(22);
  });

  it("preserves zero-base legacy merchandise costs and legacy percent costs", () => {
    const fixed = calculateExternalBudget(
      budget(phase1Case({ merchRevenueYear1: 0, merchOpexYear1: 10, costInflation: 0.2 })),
    ).result;
    expect(fixed.rows[1]!.merchOpex).toBe(12);
    const share = calculateExternalBudget(
      budget(
        phase1Case({
          merchRevenueYear1: 40,
          merchOpexYear1: 999,
          merchOpexRate: 0.25,
          ancillaryGrowth: [0.5],
          costInflation: 0.9,
        }),
      ),
    ).result;
    expect(share.rows[1]!.merchOpex).toBe(15);
  });

  it("does not validate inactive replaced costs or re-inflate already nominal external figures", () => {
    const source = phase1Case({
      cableFixedOpex: NaN,
      fbRevenueYear1: NaN,
      fbOpexYear1: NaN,
      maintenanceCapexPct: 0,
      costInflation: NaN,
      merchOpexRate: 0,
      volumeMethods: {
        merch: { revenue: { method: "perPassengerSeries", perPassengerByYear: [0] } },
      },
      passengerGrowth: [NaN],
      priceGrowth: [NaN],
    });
    const r = calculateExternalBudget(budget(source)).result;
    expect(r.rows[2]!.opex).toBe(100);
    expect(r.rows[2]!.revenue).toBe(300);
    expect(r.rows[2]!.maintenanceCapex).toBe(0);
    expect(Number.isNaN(source.costInflation)).toBe(true);
  });

  it("uses the absent maintenance default of zero and supports inherited fractional depreciation", () => {
    const source = phase1Case({ depreciationYears: 2.5, maintenanceCapexRate: 0.9 });
    delete source.maintenanceCapexPct;
    const r = calculateExternalBudget(budget(source)).result;
    expect(r.rows.map((row) => row.depreciation)).toEqual([400, 400, 200, 0, 0, 0, 0, 0, 0, 0]);
    expect(r.rows.map((row) => row.maintenanceCapex)).toEqual(Array(10).fill(0));
  });

  it("allows a zero investment and zero annual values without inventing returns", () => {
    const input = budget(phase1Case({ maintenanceCapexPct: 0 }));
    const out = calculateExternalBudget({
      ...input,
      initialCapex: 0,
      annual: input.annual.map((row) => ({
        ...row,
        passengers: 0,
        ticketNetPrice: 0,
        cableOpex: 0,
      })),
    });
    expect(out.result.equityIrr).toBeNull();
    expect(out.result.equityMultiple).toBeNull();
    expect(out.comparison.summary.revenuePerPassenger).toBeNull();
    expect(out.comparison.summary.margin).toBeNull();
  });
});

describe("External input validation and isolation", () => {
  it.each(["passengers", "ticketNetPrice", "fbRevenue", "fbOpex", "cableOpex"])(
    "rejects missing annual %s",
    (field) => {
      expect(() =>
        calculateExternalBudget(
          altered(budget(), (value) => {
            delete value.annual[2]![field];
          }),
        ),
      ).toThrow(/finite/);
    },
  );
  it.each(["passengers", "ticketNetPrice", "fbRevenue", "fbOpex", "cableOpex"])(
    "rejects invalid annual %s",
    (field) => {
      for (const bad of [-1, NaN, Infinity, -Infinity, null, "10"]) {
        expect(() =>
          calculateExternalBudget(
            altered(budget(), (value) => {
              value.annual[2]![field] = bad;
            }),
          ),
        ).toThrow();
      }
    },
  );
  it.each([-1, NaN, Infinity, -Infinity, undefined])("rejects invalid CAPEX %s", (value) => {
    expect(() => calculateExternalBudget({ ...budget(), initialCapex: value as number })).toThrow();
  });
  it.each([0, 1, 9, 11])("rejects %s annual rows", (length) => {
    expect(() =>
      calculateExternalBudget({
        ...budget(),
        annual: Array.from({ length }, (_, i) => ({ ...budget().annual[0]!, year: i + 1 })),
      }),
    ).toThrow(/ten/);
  });
  it.each([0, 2, 11, 1.5, NaN, undefined])("rejects conflicting Year 1 index %s", (value) => {
    expect(() =>
      calculateExternalBudget(
        altered(budget(), (input) => {
          input.annual[0]!["year"] = value;
        }),
      ),
    ).toThrow();
  });
  it("rejects sparse and malformed rows without inferring any amounts", () => {
    const input = budget();
    const sparse = [...input.annual];
    delete sparse[2];
    expect(() => calculateExternalBudget({ ...input, annual: sparse })).toThrow();
    expect(() =>
      calculateExternalBudget(
        altered(input, (value) => {
          value.annual[0] = null as unknown as Record<string, unknown>;
        }),
      ),
    ).toThrow();
    expect(() =>
      calculateExternalBudget(
        altered(input, (value) => {
          value.annual[0]!["grossPrice"] = 8;
        }),
      ),
    ).toThrow(/unsupported/);
  });
  it.each(ACCOUNTING_CONFIRMATIONS)("requires explicit confirmation: %s", (key) => {
    for (const value of [false, undefined, "true", 1]) {
      expect(() =>
        calculateExternalBudget(
          altered(budget(), (input) => {
            input.accounting[key] = value;
          }),
        ),
      ).toThrow(/confirmations/);
    }
  });
  it.each([
    ["loanYears", 0],
    ["loanYears", 1.5],
    ["interestRate", Infinity],
    ["debtShare", 1.1],
    ["taxRate", -0.1],
    ["depreciationYears", 0],
    ["maintenanceCapexPct", -0.1],
    ["exitMultiple", -1],
    ["exitTransactionCostRate", 2],
    ["openingYear", 2030.5],
    ["distributeCashAnnually", undefined],
  ])("rejects invalid inherited %s=%s", (field, value) => {
    expect(() =>
      calculateExternalBudget(
        altered(budget(), (input) => {
          input.inheritance[field] = value;
        }),
      ),
    ).toThrow();
  });
  it.each(["benchmark", "perPassengerSeries", "madeUp"])(
    "blocks unsupported other-revenue method %s",
    (method) => {
      expect(() =>
        calculateExternalBudget(
          altered(budget(), (input) => {
            input.inheritance.volumeMethods["other"] = {
              revenue: { method, perPassengerByYear: [1, 2] },
            };
          }),
        ),
      ).toThrow(/Unsupported inherited/);
    },
  );
  it("rejects missing active method parameters and calculated balances in snapshots", () => {
    expect(() =>
      calculateExternalBudget(
        altered(budget(), (input) => {
          input.inheritance.volumeMethods["merch"] = { revenue: { method: "annual" } };
        }),
      ),
    ).toThrow();
    expect(() =>
      calculateExternalBudget(
        altered(budget(), (input) => {
          input.inheritance["retainedCash"] = 100;
        }),
      ),
    ).toThrow(/unsupported/);
    expect(() =>
      calculateExternalBudget(
        altered(budget(), (input) => {
          input.inheritance.volumeMethods["fb"] = {};
        }),
      ),
    ).toThrow(/unsupported/);
  });
  it("blocks unsupported versions and drafts without producing outputs", () => {
    const draft: ExternalBudgetDraft = {
      version: FINANCIAL_INPUT_VERSION,
      mode: "externalBudget",
      status: "draft",
      annual: [{ year: 1 }],
    };
    expect(() => calculateFinancialInput(draft)).toThrow(/Drafts/);
    expect(() => calculateExternalBudget(draft as unknown as ExternalBudgetInput)).toThrow(
      /complete/,
    );
    expect(() =>
      calculateExternalBudget(
        altered(budget(), (input) => {
          input.version = "future";
        }),
      ),
    ).toThrow(/supported/);
    expect(() =>
      calculateExternalBudget(
        altered(budget(), (input) => {
          input.inheritance["version"] = "future";
        }),
      ),
    ).toThrow(/version/);
  });
  it.each([undefined, {}, { spend: NaN, conversion: 0.5, conversionChange: [], spendGrowth: [] }])(
    "rejects incomplete Advanced Merchandise inheritance",
    (inputs) => {
      const source = {
        ...phase1Case(),
        advanced: { commercialMerch: { enabled: true, ...(inputs ? { inputs } : {}) } },
      };
      expect(() => captureInheritance(source)).toThrow(/Advanced Merchandise/);
    },
  );
  it("rejects sparse inherited growth and revenue series", () => {
    const series = [1, 2];
    delete series[0];
    expect(() => captureInheritance(phase1Case({ ancillaryGrowth: series }))).toThrow();
    expect(() =>
      captureInheritance(
        phase1Case({
          volumeMethods: {
            merch: { revenue: { method: "perPassengerSeries", perPassengerByYear: series } },
          },
        }),
      ),
    ).toThrow();
  });
  it("fails on financial overflow instead of returning nonfinite outputs", () => {
    expect(() =>
      calculateExternalBudget({
        ...budget(),
        initialCapex: Number.MAX_VALUE,
        inheritance: captureInheritance(phase1Case({ interestRate: Number.MAX_VALUE })),
      }),
    ).toThrow(/finite/);
  });
  it.each(saved)("routes standard input unchanged: $name", (fixture) => {
    const a = fixture.assumptions as Assumptions;
    const before = structuredClone(a);
    expect(
      calculateFinancialInput({
        version: FINANCIAL_INPUT_VERSION,
        mode: "standard",
        assumptions: a,
      }),
    ).toEqual(safeCalculate(a));
    expect(a).toEqual(before);
  });
});
