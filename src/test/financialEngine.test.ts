import { describe, expect, it } from "vitest";
import { calculate, irr, type Assumptions } from "@/financialEngine";
import { projectMountain } from "@/exampleProject";

const base = (patch: Partial<Assumptions> = {}): Assumptions => ({ ...projectMountain, ...patch });

describe("financial engine", () => {
  it("weights ticket price by share, removing VAT and commission", () => {
    const r = calculate(base({
      segments: [
        { name: "A", share: 0.5, grossPrice: 112, vatRate: 0.12, commission: 0, boardingsPerGuest: 2 },
        { name: "B", share: 0.5, grossPrice: 112, vatRate: 0.12, commission: 0.2, boardingsPerGuest: 2 },
      ],
    }));
    expect(r.weightedTicket).toBeCloseTo(0.5 * 100 + 0.5 * 80, 6);
  });

  it("sums CAPEX lines and applies contingency", () => {
    const r = calculate(base({ capexItems: [{ name: "x", quantity: 10, unitCost: 1000 }, { name: "y", quantity: 1, unitCost: 5000 }], contingencyRate: 0.2 }));
    expect(r.capex).toBeCloseTo(18000, 6);
    expect(r.debt).toBeCloseTo(18000 * 0.6, 6);
    expect(r.equity).toBeCloseTo(18000 * 0.4, 6);
  });

  it("applies passenger growth to every following year, last rate repeating", () => {
    const r = calculate(base({ initialPassengers: 1000, passengerGrowth: [0.2, 0.1] }));
    expect(r.rows[1]!.passengers).toBeCloseTo(1200, 6);
    expect(r.rows[2]!.passengers).toBeCloseTo(1320, 6);
    expect(r.rows[3]!.passengers).toBeCloseTo(1452, 6);
  });

  it("amortizes debt straight-line over the loan tenor", () => {
    const r = calculate(base({ loanYears: 15 }));
    for (let i = 0; i < 15; i++) expect(r.rows[i]!.principal).toBeCloseTo(r.debt / 15, 4);
    expect(r.rows[14]!.closingDebt).toBeCloseTo(0, 4);
    expect(r.rows[15]!.principal).toBe(0);
  });

  it("exit in year 8 uses year-8 EBITDA and closing debt", () => {
    const a = base({ exitYear: 8, exitMultiple: 15, exitTransactionCostRate: 0.01 });
    const r = calculate(a);
    const y8 = r.rows[7]!;
    expect(r.enterpriseValue).toBeCloseTo(y8.ebitda * 15, 4);
    expect(r.exitEquityValue).toBeCloseTo(r.enterpriseValue - y8.closingDebt + y8.retainedCash - r.enterpriseValue * 0.01, 4);
  });

  it("reconciles distributed and retained cash without double counting", () => {
    for (const distribute of [true, false]) {
      const r = calculate(base({ distributeCashAnnually: distribute }));
      const upTo = r.rows.slice(0, 8);
      const cash = upTo.reduce((s, y) => s + y.cashAfterDebt, 0);
      const dist = upTo.reduce((s, y) => s + y.distribution, 0);
      expect(dist + upTo[7]!.retainedCash).toBeCloseTo(cash, 4);
    }
  });

  it("computes IRR on known cashflows", () => {
    expect(irr([-100, 110])!).toBeCloseTo(0.1, 6);
    expect(irr([-1000, 0, 0, 1331])!).toBeCloseTo(0.1, 6);
    expect(irr([100, 100])).toBeNull();
  });

  it("higher commission lowers realized price, EBITDA and IRR", () => {
    const a = calculate(base());
    const segs = projectMountain.segments.map((s) => (s.name === "Cruise" ? { ...s, commission: 0.3 } : s));
    const b = calculate(base({ segments: segs }));
    expect(b.weightedTicket).toBeLessThan(a.weightedTicket);
    expect(b.rows[2]!.ebitda).toBeLessThan(a.rows[2]!.ebitda);
    expect(b.equityIrr!).toBeLessThan(a.equityIrr!);
  });
});
