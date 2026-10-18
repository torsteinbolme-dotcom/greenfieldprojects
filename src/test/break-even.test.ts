import { describe, expect, it } from 'vitest';
import { calculate, type Assumptions } from '@/financialEngine';
import { projectMountain } from '@/exampleProject';
import { breakEven, DEFAULT_BREAK_EVEN_YEAR, evaluatePassengers } from '@/lib/break-even';
import { type AssumptionsWithFb } from '@/lib/fb-benchmark';
const base = (patch: Partial<Assumptions> = {}): Assumptions => ({ ...projectMountain, years: 5, exitYear: 5, initialPassengers: 1000, passengerGrowth: [0], priceGrowth: [0], ancillaryGrowth: [0], costInflation: 0, segments: [{ name: 'Adult roundtrip', share: 1, grossPrice: 100, vatRate: 0, commission: 0, boardingsPerGuest: 1 }], cableFixedOpex: 10000, fbRevenueYear1: 0, fbOpexYear1: 0, merchRevenueYear1: 0, merchOpexYear1: 0, capexItems: [{ name: 'Investment', quantity: 1, unitCost: 100000 }], contingencyRate: 0, debtShare: 0.5, interestRate: 0.1, loanYears: 5, depreciationYears: 10, taxRate: 0.25, ...patch });
describe('engine-based annual break-even', () => {
  it('defaults to the third operating year excluding construction', () => {
    expect(DEFAULT_BREAK_EVEN_YEAR).toBe(3);
    expect(evaluatePassengers(base({ openingYear: 2030 }), 3, 300).calendarYear).toBe(2032);
  });
  it('operating threshold targets EBITDA zero with fixed OPEX', () => {
    const a = base(), b = breakEven(a, 1);
    expect(b.operating.passengers).toBe(100);
    expect(evaluatePassengers(a, 1, 100).ebitda).toBe(0);
    expect(evaluatePassengers(a, 1, 99).ebitda).toBeLessThan(0);
  });
  it('cash threshold includes interest, principal and taxes but not depreciation', () => {
    const a = base(), b = breakEven(a, 1);
    expect(b.cash.passengers).toBe(250);
    const row = evaluatePassengers(a, 1, 250);
    expect(row.interest).toBe(5000); expect(row.principal).toBe(10000); expect(row.tax).toBe(0);
    expect(row.cashAfterDebt).toBe(0); expect(row.depreciation).toBe(10000);
    expect(evaluatePassengers(a, 1, 249).cashAfterDebt).toBeLessThan(0);
  });
  it('cash tax increases threshold when repayment exceeds tax depreciation', () => {
    const a = base({ depreciationYears: 100 });
    const b = breakEven(a, 1);
    expect(b.cash.passengers).toBe(281);
    const row = evaluatePassengers(a, 1, 281);
    expect(row.tax).toBe(3025);
    expect(row.cashAfterDebt).toBeGreaterThanOrEqual(0);
    expect(evaluatePassengers(a, 1, 280).cashAfterDebt).toBeLessThan(0);
  });
  it('selected-year volume is achieved with the full passenger growth history', () => {
    const a = base({ passengerGrowth: [0.1] });
    const row = evaluatePassengers(a, 3, 1210);
    expect(row.passengers).toBeCloseTo(1210);
    expect(row).toEqual(calculate(a).rows[2]);
  });
  it('selected-year debt repayment and tax-loss carryforward come directly from the engine', () => {
    const a = base({ passengerGrowth: [1], depreciationYears: 100 });
    const row = evaluatePassengers(a, 3, 400);
    expect(row).toEqual(calculate({ ...a, initialPassengers: 100 }).rows[2]);
    expect(row.interest).toBe(3000); expect(row.principal).toBe(10000);
    expect(row.tax).toBe(7750);
    expect(row.cashAfterDebt).toBe(9250);
  });
  it('uses independent frozen restaurant passenger costs, not all-variable OPEX', () => {
    const a: AssumptionsWithFb = { ...base(), fbBenchmark: { adjust: true, revenue: { assetId: 'r', year: 2025, snapshot: { assetId: 'r', name: 'Hoven', year: 2025, historicalAmount: 20000, cableCarId: 'c', cableCarName: 'Loen', cableCarPassengers: 1000, costInflation: 0, priceGrowth: [0], ancillaryGrowth: [0], adjust: true, manualAdjustment: 0 } }, opex: { assetId: 'r', year: 2025, snapshot: { assetId: 'r', name: 'Hoven', year: 2025, historicalAmount: 10000, cableCarId: 'c', cableCarName: 'Loen', cableCarPassengers: 1000, costInflation: 0, priceGrowth: [0], ancillaryGrowth: [0], adjust: true, manualAdjustment: 0 } } } };
    expect(breakEven(a, 1).operating.passengers).toBe(91);
    const row = evaluatePassengers(a, 1, 100);
    expect(row.fbRevenue).toBe(2000); expect(row.opex).toBe(11000); expect(row.ebitda).toBe(1000);
  });
  it('keeps manual non-passenger revenues and costs fixed', () => {
    const a = base({ fbRevenueYear1: 2000, fbOpexYear1: 1000, merchRevenueYear1: 3000, merchOpexYear1: 500 });
    const row = evaluatePassengers(a, 1, 100);
    expect(row.fbRevenue).toBe(2000); expect(row.merchRevenue).toBe(3000); expect(row.opex).toBe(11500);
    expect(breakEven(a, 1).operating.passengers).toBe(65);
  });
  it('does not mutate stored assumptions or change IRR/MOIC/exit output', () => {
    const a = base(), before = JSON.stringify(a), result = calculate(a);
    breakEven(a, 3);
    expect(JSON.stringify(a)).toBe(before);
    expect(calculate(a)).toEqual(result);
    expect(result.equity).toBe(50000);
    const exit = result.rows[4]; if (!exit) throw Error('Missing exit');
    expect(result.enterpriseValue).toBe(exit.ebitda * a.exitMultiple);
    expect(result.exitEquityValue).toBe(result.enterpriseValue * (1 - a.exitTransactionCostRate) - exit.closingDebt + exit.retainedCash);
  });
  it('warns for unattainable coverage rather than inventing additional equity', () => {
    const a = base({ segments: [{ name: 'Adult roundtrip', share: 1, grossPrice: 0, vatRate: 0, commission: 0, boardingsPerGuest: 1 }] });
    expect(breakEven(a, 1).operating.passengers).toBeNull();
    expect(breakEven(a, 1).cash.message).toMatch(/does not improve/);
  });
  it('rejects unresolved passenger-adjusted snapshots and invalid growth', () => {
    const a = { ...base(), fbBenchmark: { adjust: true, revenue: { assetId: 'missing', year: 2025 } } };
    expect(breakEven(a).operating.message).toMatch(/Refresh/);
    expect(breakEven(base({ passengerGrowth: [-1] }), 3).cash.passengers).toBeNull();
  });
});
