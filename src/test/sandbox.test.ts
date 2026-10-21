import { describe, expect, it, vi } from 'vitest';
import type { Assumptions } from '@/financialEngine';
import { projectMountain } from '@/exampleProject';
import references from './fixtures/production-investments.json';
import { baselineTargets, financialSnapshot, reconcileSandbox, simulateSandbox } from '@/lib/sandbox';
import { safeCalculate } from '@/lib/model';
import { initializeSeasonalPricing, seasonalRevenueTable } from '@/lib/seasonal-pricing';
import { forecastOpex } from '@/lib/forecast-opex';

const writes = vi.fn(() => { throw Error('Sandbox must never write'); });
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: writes, rpc: writes } }));
const base = (): Assumptions => structuredClone(projectMountain);
const result = (a: Assumptions) => { const r = safeCalculate(a); if (!r.result) throw Error(r.error ?? 'missing result'); return r.result; };
const targets = (a: Assumptions) => { const t = baselineTargets(result(a)); if (!t) throw Error('missing Year 3'); return t; };
function seasonal(): Assumptions {
  const a = base();
  Object.assign(a, { capacity: { monthlyAllocation: [0.6, 0.4, ...Array(10).fill(0)] } });
  a.seasonalPricing = initializeSeasonalPricing(a);
  a.seasonalPricing.months[0] = 'high';
  a.seasonalPricing.prices = a.seasonalPricing.prices.map(p => ({ ...p, high: p.high * 1.4 }));
  return a;
}

describe('Sandbox complete zero-adjustment reconciliation', () => {
  const variants: [string, Assumptions][] = [
    ...Object.entries(references).map(([name, a]) => [name, a as Assumptions] as [string, Assumptions]),
    ['example', base()], ['seasonal', seasonal()],
    ['all volume methods', { ...base(), volumeMethods: { fb: { revenue: { method: 'perPassenger', perPassenger: 100 }, opex: { method: 'fixedVariable', fixedAmount: 100000, variablePerPassenger: 48 } }, merch: { revenue: { method: 'annual', annualAmount: 200000 }, opex: { method: 'revenuePercent', revenuePercent: 0.4 } }, other: { revenue: { method: 'perPassenger', perPassenger: 20 }, opex: { method: 'perPassenger', perPassenger: 10 } } } }],
    ['no debt, early exit', { ...base(), debtShare: 0, exitYear: 3, openingYear: 2040 }],
    ['high debt, distributions, short depreciation', { ...seasonal(), debtShare: 0.95, distributeCashAnnually: true, depreciationYears: 5, loanYears: 4, exitYear: 12 }],
    ['zero passengers', { ...base(), initialPassengers: 0, fbFollowsPassengers: false }],
    ['zero fare', { ...base(), segments: base().segments.map(s => ({ ...s, grossPrice: 0 })) }],
  ];
  it.each(variants)('%s: every engine field, annual breakdown, monthly result, unit economics and break-even agrees', (_name, a) => {
    const r = result(a), before = structuredClone(a);
    const s = simulateSandbox(a, baselineTargets(r) ?? undefined);
    expect(s.result).toEqual(r); // Deterministic zero overrides: exact, not just display rounding.
    expect(s.assumptions).toEqual(before);
    const differences = reconcileSandbox(financialSnapshot(a, r), financialSnapshot(s.assumptions, s.result));
    expect(differences, JSON.stringify(differences)).toEqual([]);
  });
  it('reports metric/year index, full values and delta instead of hiding mismatches', () => {
    expect(reconcileSandbox({ rows: [{ tax: 1 }] }, { rows: [{ tax: 1.01 }] })).toEqual([{ metric: 'rows.0.tax', baseline: 1, sandbox: 1.01, difference: 1.01 - 1 }]);
    expect(reconcileSandbox({ value: 1 }, { value: 1 + 1e-9 })).toEqual([]);
  });
});

describe('Sandbox commercial overrides and isolation', () => {
  it('never mutates saved or cached nested assumptions, snapshots or another project; never writes', () => {
    const a = seasonal(), before = structuredClone(a), other = base();
    const t = targets(a);
    const s = simulateSandbox(a, { passengers: t.passengers * 1.2, ticketPrice: t.ticketPrice * 0.9 });
    s.assumptions.capexItems[0] && (s.assumptions.capexItems[0].name = 'isolated');
    expect(a).toEqual(before);
    expect(result(other)).toEqual(result(base()));
    expect(writes).not.toHaveBeenCalled();
  });
  it('scales all passenger years once and retains growth, segment mix and monthly allocations', () => {
    const a = seasonal(), r = result(a), t = targets(a), s = simulateSandbox(a, { ...t, passengers: t.passengers * 1.25 });
    r.rows.forEach((v, i) => expect(s.result.rows[i]?.passengers).toBeCloseTo(v.passengers * 1.25, 7));
    expect(s.assumptions.passengerGrowth).toEqual(a.passengerGrowth);
    expect(s.assumptions.segments).toEqual(a.segments);
    const b = seasonalRevenueTable(a, t.passengers, 3), n = seasonalRevenueTable(s.assumptions, s.result.rows[2]?.passengers ?? 0, 3);
    b?.months.forEach((m, i) => { expect(n?.months[i]?.passengers).toBeCloseTo(m.passengers * 1.25, 7); expect(n?.months[i]?.share).toBe(m.share); });
  });
  it('preserves segment/seasonal ratios, VAT, commissions and price growth', () => {
    const a = seasonal(), r = result(a), t = targets(a), s = simulateSandbox(a, { ...t, ticketPrice: t.ticketPrice * 1.2 });
    s.result.rows.forEach((v, i) => expect(v.ticketNetPrice).toBeCloseTo((r.rows[i]?.ticketNetPrice ?? 0) * 1.2, 7));
    s.assumptions.segments.forEach((v, i) => { expect(v.vatRate).toBe(a.segments[i]?.vatRate); expect(v.commission).toBe(a.segments[i]?.commission); expect(v.share).toBe(a.segments[i]?.share); });
    a.seasonalPricing?.prices.forEach((p, i) => { expect(s.assumptions.seasonalPricing?.prices[i]?.low).toBeCloseTo(p.low * 1.2, 7); expect(s.assumptions.seasonalPricing?.prices[i]?.high).toBeCloseTo(p.high * 1.2, 7); });
    expect(s.assumptions.priceGrowth).toEqual(a.priceGrowth);
  });
  it('effective fare uses independent VAT and commission reference', () => {
    const a = { ...base(), priceGrowth: [0], segments: [{ name: 'Adult', share: 0.5, grossPrice: 112, vatRate: 0.12, commission: 0, boardingsPerGuest: 2 }, { name: 'Cruise', share: 0.25, grossPrice: 112, vatRate: 0.12, commission: 0.2, boardingsPerGuest: 8 }, { name: 'Tour operators', share: 0.25, grossPrice: 112, vatRate: 0.12, commission: 0.15, boardingsPerGuest: 2 }] };
    expect(targets(a).ticketPrice).toBeCloseTo(91.25, 10);
    const s = simulateSandbox(a, { passengers: 1000, ticketPrice: 182.5 });
    expect(s.result.rows[2]?.ticketRevenue).toBeCloseTo(182500, 7);
    expect(s.result.rows[2]?.ticketNetPrice).toBeCloseTo(182.5, 10);
  });
  it('per-passenger revenue/variable OPEX scale, annual revenue and fixed OPEX do not', () => {
    const a: Assumptions = { ...base(), volumeMethods: { fb: { revenue: { method: 'perPassenger', perPassenger: 100 }, opex: { method: 'fixedVariable', fixedAmount: 500000, variablePerPassenger: 48 } }, merch: { revenue: { method: 'annual', annualAmount: 200000 }, opex: { method: 'revenuePercent', revenuePercent: 0.4 } }, other: { revenue: { method: 'annual', annualAmount: 100000 }, opex: { method: 'annual', annualAmount: 10000 } } }, opexGrowth: { fb: [0] } };
    const b = result(a), t = targets(a), s = simulateSandbox(a, { ...t, passengers: t.passengers * 2 });
    const y = s.result.rows[2]; if (!y) throw Error('missing year');
    expect(y.fbRevenue).toBeCloseTo((b.rows[2]?.fbRevenue ?? 0) * 2, 5);
    expect(y.fbOpex).toBeCloseTo(500000 + y.passengers * 48, 5);
    expect(y.merchRevenue).toBe(b.rows[2]?.merchRevenue);
    expect(y.merchOpex).toBe(b.rows[2]?.merchOpex);
    expect(y.otherOpex).toBe(b.rows[2]?.otherOpex);
    expect(forecastOpex(s.assumptions, y).cableFixed).toBe(forecastOpex(a, b.rows[2] ?? y).cableFixed);
  });
  it('passenger-linked manual F&B scales once; explicit F&B cost growth retains its cost basis', () => {
    const a = { ...base(), fbFollowsPassengers: true, opexGrowth: { fb: [0.03] } }, t = targets(a), r = result(a);
    const s = simulateSandbox(a, { ...t, passengers: t.passengers * 1.2 });
    expect(s.result.rows[2]?.fbRevenue).toBeCloseTo((r.rows[2]?.fbRevenue ?? 0) * 1.2, 5);
    const simulatedRow = s.result.rows[2], baselineRow = r.rows[2];
    if (!simulatedRow || !baselineRow) throw Error('Missing Year 3');
    expect(forecastOpex(s.assumptions, simulatedRow).fb).toBe(forecastOpex(a, baselineRow).fb);
  });
  it('reset/default restores baseline and Standard Comparison is unchanged after adjustments', () => {
    const a = base(), r = result(a), t = targets(a);
    expect(simulateSandbox(a, { passengers: t.passengers * 0.5, ticketPrice: t.ticketPrice * 1.1 }).result).not.toEqual(r);
    expect(simulateSandbox(a).result).toEqual(r);
    expect(result(a)).toEqual(r);
  });
  it('normalization independently reaches common targets with different opening and exit years', () => {
    const a = base(), b = { ...base(), initialPassengers: 50000, openingYear: 2040, exitYear: 4, cableFixedOpex: 2000000 };
    const common = { passengers: 250000, ticketPrice: 500 }, x = simulateSandbox(a, common), y = simulateSandbox(b, common);
    for (const s of [x, y]) { expect(s.result.rows[2]?.passengers).toBeCloseTo(250000, 6); expect(s.result.rows[2]?.ticketNetPrice).toBeCloseTo(500, 8); }
    expect(x.assumptions.exitYear).toBe(a.exitYear); expect(y.assumptions.exitYear).toBe(4);
    expect(y.result.rows[2]?.calendarYear).toBe(2042); expect(x.result.equityMultiple).not.toBe(y.result.equityMultiple);
  });
  it('preserves financing, CAPEX and all inactive category inputs', () => {
    const a = base(), t = targets(a), s = simulateSandbox(a, { ...t, passengers: t.passengers * 1.5 });
    for (const k of ['capexItems', 'contingencyRate', 'debtShare', 'interestRate', 'loanYears', 'taxRate', 'depreciationYears', 'maintenanceCapexPct', 'exitYear', 'exitMultiple', 'volumeMethods', 'opexGrowth'] as const) expect(s.assumptions[k]).toEqual(a[k]);
  });
  it('handles zero targets without divisions by zero and rejects unsupported zero baselines', () => {
    const a = base(), s = simulateSandbox(a, { passengers: 0, ticketPrice: 0 });
    expect(s.result.rows.every(r => r.passengers === 0 && r.ticketRevenue === 0)).toBe(true);
    expect(() => simulateSandbox({ ...a, initialPassengers: 0 }, { passengers: 100, ticketPrice: targets(a).ticketPrice })).toThrow(/zero Year 3 passenger/);
    expect(() => simulateSandbox({ ...a, segments: a.segments.map(v => ({ ...v, grossPrice: 0 })) }, { passengers: targets(a).passengers, ticketPrice: 100 })).toThrow(/zero Year 3 ticket price/);
    expect(() => simulateSandbox(a, { passengers: -1, ticketPrice: 100 })).toThrow(/nonnegative/);
  });
  it('independent full funding reference reconciles MOIC and IRR through actual exit', () => {
    const a: Assumptions = { ...base(), initialPassengers: 1000, passengerGrowth: [0], priceGrowth: [0], capexItems: [{ name: 'test', quantity: 1, unitCost: 100000 }], contingencyRate: 0, debtShare: 0, cableFixedOpex: 0, cableVariableCostPerPassenger: 0, fbRevenueYear1: 0, merchRevenueYear1: 0, fbOpexYear1: 0, merchOpexYear1: 0, maintenanceCapexPct: 0, depreciationYears: 10, years: 8, exitYear: 8, exitMultiple: 5, exitTransactionCostRate: 0, taxRate: 0.22, distributeCashAnnually: false, segments: [{ name: 'Adult', share: 1, grossPrice: 112, vatRate: 0.12, commission: 0, boardingsPerGuest: 2 }] };
    const s = simulateSandbox(a, { passengers: 1000, ticketPrice: 200 });
    // EBITDA 200000, depreciation 10000, tax 41800, yearly cash 158200;
    // EV 1000000 + 8 years retained cash 1265600 = 2265600 proceeds.
    expect(s.result.rows[0]?.tax).toBeCloseTo(41800, 6);
    expect(s.result.exitEquityValue).toBeCloseTo(2265600, 6);
    expect(s.result.equityMultiple).toBeCloseTo(22.656, 8);
    expect(s.result.equityIrr).toBeCloseTo(22.656 ** (1 / 8) - 1, 8);
    const independent = [-100000, 0, 0, 0, 0, 0, 0, 0, 2265600];
    expect(s.result.cashflows).toHaveLength(9);
    s.result.cashflows.forEach((cf, i) => expect(Math.abs(cf - (independent[i] ?? NaN))).toBeLessThanOrEqual(1e-7));
  });
});