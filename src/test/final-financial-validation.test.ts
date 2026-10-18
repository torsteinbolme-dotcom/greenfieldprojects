import { describe, expect, it } from "vitest";
import { calculate, type Assumptions } from "@/financialEngine";
import { withFbBenchmark, type AssumptionsWithFb } from "@/lib/fb-benchmark";
import { maintenanceReview } from "@/lib/maintenance";

// Independently hand-calculated two-year investment, no example-project fixture or derived expectations.
const fixture = (patch: Partial<Assumptions> = {}): Assumptions => ({
  name: "Validation", openingYear: 2031, years: 2, exitYear: 2,
  initialPassengers: 100, segments: [{ name: "Adult", share: 1, grossPrice: 1.12, vatRate: 0.12, commission: 0.2, boardingsPerGuest: 2 }],
  passengerGrowth: [1], priceGrowth: [0], ancillaryGrowth: [0],
  fbRevenueYear1: 20, fbOpexYear1: 30, merchRevenueYear1: 0, merchOpexYear1: 0,
  cableFixedOpex: 50, cableVariableCostPerPassenger: 0, costInflation: 0,
  fbBenchmark: { adjust: true, revenue: { assetId: "restaurant", year: 2025 }, opex: { assetId: "restaurant", year: 2025, adjust: false } },
  capexItems: [{ name: "Lift", quantity: 2, unitCost: 80 }], contingencyRate: 0.25,
  debtShare: 0.5, interestRate: 0.1, loanYears: 2, taxRate: 0, depreciationYears: 10,
  maintenanceCapexRate: 0.9, maintenanceCapexPct: 0,
  exitMultiple: 1, exitTransactionCostRate: 0, distributeCashAnnually: false, ...patch,
});

describe("independent financial validation", () => {
  it("profitable project has literal revenue, EBITDA, financing and returns without additional funding", () => {
    const r = calculate(fixture({ initialPassengers: 200 }));
    expect(r.weightedTicket).toBeCloseTo(0.8, 10);
    expect([r.capex, r.debt, r.equity]).toEqual([200, 100, 100]);
    expect(r.rows.map(x => x.ticketRevenue)).toEqual([160, 320]);
    expect(r.rows.map(x => x.fbRevenue)).toEqual([20, 40]);
    expect(r.rows.map(x => x.revenue)).toEqual([180, 360]);
    expect(r.rows.map(x => x.opex)).toEqual([80, 80]);
    expect(r.rows.map(x => x.ebitda)).toEqual([100, 280]);
    expect((r.rows[0]?.ebitda ?? 0) / (r.rows[0]?.revenue ?? 1)).toBeCloseTo(5 / 9, 10);
    expect(r.rows.map(x => x.interest)).toEqual([10, 5]);
    expect(r.rows.map(x => x.principal)).toEqual([50, 50]);
    expect(r.rows.map(x => x.closingDebt)).toEqual([50, 0]);
    expect(r.rows.map(x => x.retainedCash)).toEqual([40, 265]);
    expect(r.additionalEquity).toBe(0);
    expect(r.enterpriseValue).toBe(280);
    expect(r.exitEquityValue).toBe(545);
    expect(r.cashflows).toEqual([-100, 0, 545]);
    expect(r.equityIrr).toBeCloseTo(Math.sqrt(5.45) - 1, 8);
    expect(r.equityMultiple).toBe(5.45);
  });

  it("early losses include funding at the correct time without subtracting deficits again at exit", () => {
    const r = calculate(fixture());
    expect(r.rows.map(x => x.cashAfterDebt)).toEqual([-40, 65]);
    expect(r.rows.map(x => x.equityInjection)).toEqual([40, 0]);
    expect(r.rows.map(x => x.retainedCash)).toEqual([0, 65]);
    expect(r.totalEquityInvested).toBe(140);
    expect(r.exitEquityValue).toBe(185);
    expect(r.cashflows).toEqual([-100, -40, 185]);
    expect(r.equityMultiple).toBeCloseTo(185 / 140, 10);
    expect(r.equityIrr).toBeCloseTo((-40 + Math.sqrt(75600)) / 200 - 1, 8);
  });

  it("maintenance stays below EBITDA and is included in funding, closing cash, IRR and MOIC", () => {
    const r = calculate(fixture({ maintenanceCapexPct: 0.05 }));
    expect(r.rows.map(x => x.revenue)).toEqual([100, 200]);
    expect(r.rows.map(x => x.ebitda)).toEqual([20, 120]);
    expect(r.rows.map(x => x.maintenanceCapex)).toEqual([10, 10]);
    expect(r.rows.map(x => x.cashAfterDebt)).toEqual([-50, 55]);
    expect(r.rows.map(x => x.equityInjection)).toEqual([50, 0]);
    expect(r.totalEquityInvested).toBe(150);
    expect(r.exitEquityValue).toBe(175);
    expect(r.cashflows).toEqual([-100, -50, 175]);
    expect(r.equityIrr).toBeCloseTo(0.096291201783626, 8);
    expect(r.equityMultiple).toBeCloseTo(7 / 6, 10);
  });

  it("distributed cash is paid once and excluded from retained exit cash", () => {
    const r = calculate(fixture({ maintenanceCapexPct: 0.05, distributeCashAnnually: true }));
    expect(r.rows.map(x => x.distribution)).toEqual([0, 55]);
    expect(r.rows.map(x => x.retainedCash)).toEqual([0, 0]);
    expect(r.exitEquityValue).toBe(120);
    expect(r.cashflows).toEqual([-100, -50, 175]);
    expect(r.equityMultiple).toBeCloseTo(7 / 6, 10);
  });

  it("variable cable OPEX multiplies passengers and escalates once", () => {
    const r = calculate(fixture({ cableVariableCostPerPassenger: 0.1, opexGrowth: { cable: [0.1], fb: [0] } }));
    expect(r.rows.map(x => x.opex)).toEqual([90, 107]);
    expect(r.rows.map(x => x.ebitda)).toEqual([10, 93]);
    expect(r.rows.map(x => x.equityInjection)).toEqual([50, 0]);
  });

  it("uses frozen restaurant amounts and independent passenger-linked revenue and costs", () => {
    const a: AssumptionsWithFb = fixture();
    const snapshot = { assetId: "restaurant", name: "Restaurant", year: 2025, cableCarId: "lift", cableCarName: "Lift", cableCarPassengers: 1000, costInflation: 0, priceGrowth: [0], ancillaryGrowth: [0], adjust: true, manualAdjustment: 0 };
    a.fbBenchmark = { adjust: true, revenue: { assetId: "restaurant", year: 2025, snapshot: { ...snapshot, historicalAmount: 200 } }, opex: { assetId: "restaurant", year: 2025, snapshot: { ...snapshot, historicalAmount: 150 } } };
    const scaled = withFbBenchmark(a, [], []);
    expect(scaled.fbRevenueYear1).toBe(20);
    expect(scaled.fbOpexYear1).toBe(15);
    const r = calculate(scaled);
    expect(r.rows.map(x => x.fbRevenue)).toEqual([20, 40]);
    expect(r.rows.map(x => x.opex)).toEqual([65, 80]);
    expect(r.rows.map(x => x.ebitda)).toEqual([35, 120]);
    expect(a.fbBenchmark.revenue?.snapshot?.historicalAmount).toBe(200);
  });

  it("legacy conflicts are flagged without changing the active percentage or saved history", () => {
    const a = fixture({ maintenanceCapexPct: 0.005, maintenanceCapexRate: 0.01 });
    const before = JSON.stringify(a);
    expect(maintenanceReview(a)).not.toBeNull();
    expect(JSON.stringify(a)).toBe(before);
    expect(calculate(a).rows.map(x => x.maintenanceCapex)).toEqual([1, 1]);
    const legacy = fixture({ maintenanceCapexRate: 0.01 });
    delete legacy.maintenanceCapexPct;
    expect(maintenanceReview(legacy)).not.toBeNull();
    expect(calculate(legacy).rows.map(x => x.maintenanceCapex)).toEqual([0, 0]);
    expect(maintenanceReview(fixture({ maintenanceCapexRate: 0 }))).toBeNull();
  });
  it("uses retained cash before requesting fresh equity", () => {
    const r = calculate(fixture({ initialPassengers: 200, passengerGrowth: [-0.5] }));
    expect(r.rows.map(x => x.ebitda)).toEqual([100, 10]);
    expect(r.rows.map(x => x.cashAfterDebt)).toEqual([40, -45]);
    expect(r.rows.map(x => x.equityInjection)).toEqual([0, 5]);
    expect(r.rows.map(x => x.retainedCash)).toEqual([40, 0]);
    expect(r.totalEquityInvested).toBe(105);
  });
  it("deducts depreciation and interest and offsets carried tax losses before tax", () => {
    const r = calculate(fixture({ taxRate: 0.2 }));
    // Y1 EBITDA 20 - depreciation 20 - interest 10 = loss 10.
    // Y2 EBITDA 120 - depreciation 20 - interest 5 - loss 10 = taxable 85.
    expect(r.rows.map(x => x.depreciation)).toEqual([20, 20]);
    expect(r.rows.map(x => x.tax)).toEqual([0, 17]);
    expect(r.rows.map(x => x.cashAfterDebt)).toEqual([-40, 48]);
  });
});