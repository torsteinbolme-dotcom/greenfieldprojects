import { describe, expect, it } from 'vitest';
import { calculate, type Assumptions } from '@/financialEngine';
import { projectMountain as exampleProject } from '@/exampleProject';
import { initializeFromYear1 } from '@/lib/volume-methods';

const base = () => structuredClone(exampleProject) as Assumptions;
const capexOf = (a: Assumptions) => a.capexItems.reduce((s, c) => s + c.quantity * c.unitCost, 0) * (1 + a.contingencyRate);

describe('depreciation stops at end of useful life', () => {
  for (const life of [5, 15, 30]) it(`useful life ${life} with 15-year forecast`, () => {
    const a = { ...base(), years: 15, depreciationYears: life };
    const capex = capexOf(a), r = calculate(a);
    r.rows.forEach(row => expect(row.depreciation).toBeCloseTo(row.year <= life ? capex / life : 0, 4));
    const total = r.rows.reduce((s, x) => s + x.depreciation, 0);
    expect(total).toBeLessThanOrEqual(capex + 1e-6);
    if (life <= 15) expect(total).toBeCloseTo(capex, 4);
    r.rows.forEach(row => expect(row.ebit).toBeCloseTo(row.ebitda - row.depreciation, 6));
  });
  it('depreciation is not a cash item', () => {
    const r = calculate({ ...base(), years: 15, depreciationYears: 5 });
    r.rows.forEach(x => expect(x.cashAfterDebt).toBeCloseTo(x.ebitda - x.interest - x.principal - x.tax - x.maintenanceCapex, 4));
  });
});

describe('zero revenue keeps fixed legacy costs', () => {
  it('F&B Year 1 OPEX remains with zero F&B revenue', () => {
    const a = { ...base(), fbRevenueYear1: 0, fbFollowsPassengers: false, opexGrowth: undefined, fbOpexYear1: 4_000_000, costInflation: 0.03 };
    const r = calculate(a); const z = calculate({ ...a, fbOpexYear1: 0 });
    expect(r.rows[2]!.opex - z.rows[2]!.opex).toBeCloseTo(4_000_000 * 1.03 ** 2, 2);
  });
  it('merchandise OPEX remains with zero merchandise revenue (legacy ratio)', () => {
    const a = { ...base(), merchRevenueYear1: 0, merchOpexRate: null, merchOpexYear1: 1_000_000, opexGrowth: undefined, costInflation: 0.02 };
    const r = calculate(a); const z = calculate({ ...a, merchOpexYear1: 0 });
    expect(r.rows[1]!.opex - z.rows[1]!.opex).toBeCloseTo(1_020_000, 2);
  });
  it('percentage-of-revenue OPEX is zero at zero revenue; fixed+variable keeps fixed at zero passengers', () => {
    const a = { ...base(), initialPassengers: 0, volumeMethods: { other: { opex: { method: 'fixedVariable' as const, fixedAmount: 500_000, variablePerPassenger: 10 } }, merch: { revenue: { method: 'perPassenger' as const, perPassenger: 20 }, opex: { method: 'revenuePercent' as const, revenuePercent: 0.4 } } } };
    const y = calculate(a).rows[0]!;
    expect(y.merchOpex).toBe(0); expect(y.otherOpex).toBe(500_000);
  });
});

describe('initialize from Year 1 value', () => {
  it('converts per the brief examples', () => {
    expect(initializeFromYear1('perPassenger', { amount: 25_000_000, revenue: 0, passengers: 250_000 })).toEqual({ perPassenger: 100 });
    expect(initializeFromYear1('perPassenger', { amount: 12_000_000, revenue: 0, passengers: 250_000 })).toEqual({ perPassenger: 48 });
    expect(initializeFromYear1('revenuePercent', { amount: 12_000_000, revenue: 25_000_000, passengers: 250_000 })).toEqual({ revenuePercent: 0.48 });
  });
  it('handles zero passengers and requires an explicit fixed/variable split', () => {
    expect(initializeFromYear1('perPassenger', { amount: 1, revenue: 0, passengers: 0 })).toBeNull();
    expect(initializeFromYear1('fixedVariable', { amount: 12_000_000, revenue: 0, passengers: 250_000 })).toBeNull();
    expect(initializeFromYear1('fixedVariable', { amount: 12_000_000, revenue: 0, passengers: 250_000, fixedShare: 0.25 })).toEqual({ fixedAmount: 3_000_000, variablePerPassenger: 36 });
  });
});
