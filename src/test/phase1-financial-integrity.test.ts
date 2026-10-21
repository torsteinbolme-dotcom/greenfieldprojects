import { describe, expect, it } from "vitest";
import { calculate } from "@/financialEngine";
import { irrAtYear, moicAtYear } from "@/lib/portfolio";
import { projectReturns } from "@/lib/year3";
import { projectMetrics } from "@/lib/project-benchmarks";

import { phase1Case } from "./fixtures/phase1";

describe("Phase 1 independent financial references", () => {
  it("preserves Year 3 EBITDA, Year 8 equity returns and every equity cash flow", () => {
    const a = phase1Case(),
      r = calculate(a);
    expect(r.rows[2]!.ebitda).toBe(200);
    expect([r.capex, r.debt, r.equity]).toEqual([1000, 600, 400]);
    expect(r.rows.map((x) => x.interest)).toEqual([60, 54, 48, 42, 36, 30, 24, 18]);
    r.rows.forEach((x) => expect(x.principal).toBe(60));
    [52, 56.8, 61.6, 66.4, 71.2, 76, 80.8, 85.6].forEach((cash, i) =>
      expect(r.rows[i]!.cashAfterDebt).toBeCloseTo(cash, 10),
    );
    expect(r.rows[7]!.closingDebt).toBe(120);
    expect(r.rows[7]!.retainedCash).toBeCloseTo(550.4, 10);
    expect(r.exitEquityValue).toBeCloseTo(1430.4, 10);
    expect(r.cashflows).toEqual([-400, 0, 0, 0, 0, 0, 0, 0, 1430.4]);
    expect(r.equityMultiple).toBeCloseTo(3.576, 10);
    expect(r.equityIrr).toBeCloseTo(3.576 ** (1 / 8) - 1, 9);
    expect(moicAtYear(a, r)).toBeCloseTo(3.576, 10);
    expect(irrAtYear(a, r)).toBeCloseTo(3.576 ** (1 / 8) - 1, 9);
    const earlierExit = phase1Case({ exitYear: 3 });
    expect(moicAtYear(earlierExit, calculate(earlierExit))).toBeCloseTo(3.576, 10);
    expect(irrAtYear(earlierExit, calculate(earlierExit))).toBeCloseTo(3.576 ** (1 / 8) - 1, 9);
  });

  it("includes a loss-year equity injection once, at its actual time", () => {
    const r = calculate(
      phase1Case({
        segments: [
          {
            name: "Independent fare",
            share: 1,
            grossPrice: 1,
            vatRate: 0,
            commission: 0,
            boardingsPerGuest: 2,
          },
        ],
        passengerGrowth: [1, 0],
        cableFixedOpex: 150,
        capexItems: [{ name: "Lift", quantity: 1, unitCost: 100 }],
        interestRate: 0,
        taxRate: 0,
      }),
    );
    expect(r.rows[2]!.ebitda).toBe(50);
    expect(r.cashflows).toEqual([-40, -58, 0, 0, 0, 0, 0, 0, 532]);
    expect(r.totalEquityInvested).toBe(98);
    expect(r.equityMultiple).toBeCloseTo(532 / 98, 10);
  });

  it("deducts maintenance from unlevered FCF, project IRR and operating payback", () => {
    const a = phase1Case(),
      r = calculate(a),
      p = projectReturns(a, r);
    expect(p.fcf).toEqual([160, 160, 160, 160, 160, 160, 160, 160]);
    expect(p.flows).toEqual([-1000, 160, 160, 160, 160, 160, 160, 160, 1160]);
    expect(p.projectIrr).toBeCloseTo(0.16, 9);
    expect(p.payback).toBe(6.25);
    // Removing maintenance reproduces the prior valid zero-maintenance result.
    const z = phase1Case({ maintenanceCapexPct: 0 });
    expect(projectReturns(z, calculate(z)).projectIrr).toBeCloseTo(0.18, 9);
  });

  it("uses selected-year net ticket pricing after growth, VAT and commission", () => {
    const a = phase1Case({
      priceGrowth: [0.1],
      segments: [
        {
          name: "Cruise custom",
          share: 1,
          grossPrice: 112,
          vatRate: 0.12,
          commission: 0.2,
          boardingsPerGuest: 2,
        },
      ],
    });
    const r = calculate(a);
    expect(r.rows[0]!.ticketNetPrice).toBeCloseTo(80, 10);
    expect(r.rows[2]!.ticketNetPrice).toBeCloseTo(96.8, 10);
    expect(projectMetrics(a, r.rows[2]!).cableRevenuePerPax).toBeCloseTo(96.8, 10);
    expect(projectMetrics(a, r.rows[0]!).cableRevenuePerPax).toBeCloseTo(80, 10);
  });
});
