import { describe, expect, it } from 'vitest';
import { calculate, type Assumptions } from '@/financialEngine';
import { projectMountain } from '@/exampleProject';
import { forecastOpex } from '@/lib/forecast-opex';
import { economicsAtYear } from '@/lib/unit-economics';
import { presentationData } from '@/lib/presentation-data';
import { splitYear } from '@/lib/year3';
import { withFbBenchmark, type AssumptionsWithFb } from '@/lib/fb-benchmark';

const base: Assumptions = { ...projectMountain, initialPassengers: 1000, passengerGrowth: [.2, .1], ancillaryGrowth: [.1], costInflation: .05, opexGrowth: { fb: [.05], merch: [.05] }, fbRevenueYear1: 10000, fbOpexYear1: 6000, merchRevenueYear1: 2000, merchOpexYear1: 1000 };
const first = (a: Assumptions, year = 1) => { const row = calculate(a).rows[year - 1]; if (!row) throw Error('Missing year'); return row; };
describe('independent volume method references', () => {
  it('annual amounts escalate without passenger scaling', () => {
    const a: Assumptions = { ...base, fbFollowsPassengers: true, volumeMethods: { fb: { revenue: { method: 'annual', annualAmount: 10000 }, opex: { method: 'annual', annualAmount: 6000 } } } };
    expect(first(a, 2).fbRevenue).toBeCloseTo(11000, 8);
    expect(first(a, 2).fbOpex).toBeCloseTo(6300, 8);
  });
  it('per passenger revenue counts passenger growth once and escalates net unit price once', () => {
    const a: Assumptions = { ...base, volumeMethods: { fb: { revenue: { method: 'perPassenger', perPassenger: 125 } } } };
    expect(first(a).fbRevenue).toBe(125000);
    expect(first(a, 2).fbRevenue).toBeCloseTo(165000, 8);
    expect(first(a, 3).fbRevenue).toBeCloseTo(199650, 8);
  });
  it('per passenger OPEX counts passengers once and cost inflation once', () => {
    const a: Assumptions = { ...base, volumeMethods: { merch: { opex: { method: 'perPassenger', perPassenger: 25 } } } };
    expect(first(a, 2).merchOpex).toBeCloseTo(31500, 8);
    expect(first(a, 3).merchOpex).toBeCloseTo(36382.5, 8);
  });
  it('percentage OPEX uses only corresponding revenue with no added inflation', () => {
    const a: Assumptions = { ...base, volumeMethods: { fb: { revenue: { method: 'perPassenger', perPassenger: 125 }, opex: { method: 'revenuePercent', revenuePercent: .72 } } } };
    expect(first(a, 2).fbOpex).toBeCloseTo(118800, 8);
  });
  it('fixed plus variable inflation applies to each component', () => {
    const a: Assumptions = { ...base, volumeMethods: { other: { opex: { method: 'fixedVariable', fixedAmount: 5000, variablePerPassenger: 5 } } } };
    expect(first(a).otherOpex).toBe(10000);
    expect(first(a, 2).otherOpex).toBeCloseTo(11550, 8);
  });
  it('nonzero fixed costs remain at zero revenue and zero passengers', () => {
    const a: Assumptions = { ...base, initialPassengers: 0, volumeMethods: { fb: { revenue: { method: 'perPassenger', perPassenger: 125 }, opex: { method: 'fixedVariable', fixedAmount: 5000, variablePerPassenger: 90 } } } };
    expect(first(a, 2).fbRevenue).toBe(0);
    expect(first(a, 2).fbOpex).toBe(5250);
  });
  it('frozen benchmarks use their associated cable car denominator and retain inactive amounts', () => {
    const a: AssumptionsWithFb = { ...base, fbBenchmark: { adjust: true, revenue: { assetId: 'restaurant', year: 2025, snapshot: { assetId: 'restaurant', name: 'Frozen', year: 2025, historicalAmount: 125000, cableCarId: 'cable', cableCarName: 'Cable', cableCarPassengers: 500, costInflation: .05, priceGrowth: [], ancillaryGrowth: [], adjust: true, manualAdjustment: 0 } } }, volumeMethods: { fb: { revenue: { method: 'benchmark' } } } };
    expect(first(a).fbRevenue).toBe(250000);
    expect(first(a, 2).fbRevenue).toBeCloseTo(315000, 8); // original benchmark passengers × ticket escalation
    expect(withFbBenchmark(a, [], []).fbRevenueYear1).toBe(10000);
    const switched = { ...a, volumeMethods: { fb: { revenue: { method: 'annual' as const, annualAmount: 10000 } } } };
    expect(first(switched).fbRevenue).toBe(10000);
    expect(switched.fbBenchmark).toEqual(a.fbBenchmark);
  });
  it('absent and explicit legacy methods keep every financial output exactly unchanged', () => {
    const old = calculate(base);
    const explicit = calculate({ ...base, volumeMethods: { fb: { revenue: { method: 'legacy' }, opex: { method: 'legacy' } }, merch: { revenue: { method: 'legacy' }, opex: { method: 'legacy' } } } });
    const strip = (r: typeof old) => ({ ...r, rows: r.rows.map(({ otherRevenue, fbOpex, merchOpex, otherOpex, ...row }) => row) });
    expect(strip(explicit)).toEqual(strip(old));
  });
  it('inactive inputs never contribute and copied scenarios do not mutate Base', () => {
    const before = JSON.stringify(base);
    const copy: Assumptions = JSON.parse(JSON.stringify({ ...base, volumeMethods: { fb: { revenue: { method: 'perPassenger', perPassenger: 125, annualAmount: 999999 } } } }));
    expect(first(copy).fbRevenue).toBe(125000);
    expect(JSON.stringify(base)).toBe(before);
    expect(first(base).fbRevenue).toBe(10000);
  });
  it('rejects invalid active numbers but ignores inactive stale inputs', () => {
    expect(() => first({ ...base, volumeMethods: { fb: { opex: { method: 'perPassenger', perPassenger: -1 } } } })).toThrow();
    expect(first({ ...base, volumeMethods: { fb: { opex: { method: 'annual', annualAmount: 6000, perPassenger: -1 } } } }).fbOpex).toBe(6000);
  });
});
describe('shared unit economics', () => {
  const a: Assumptions = { ...base, volumeMethods: { fb: { revenue: { method: 'perPassenger', perPassenger: 125 }, opex: { method: 'perPassenger', perPassenger: 90 } }, merch: { revenue: { method: 'perPassenger', perPassenger: 25 }, opex: { method: 'revenuePercent', revenuePercent: 1 } }, other: { revenue: { method: 'annual', annualAmount: 1000 }, opex: { method: 'fixedVariable', fixedAmount: 500, variablePerPassenger: 5 } } } };
  it('every component equals actual annual engine results divided by passengers and reconciles to EBITDA', () => {
    const r = calculate(a);
    for (const row of r.rows) {
      const e = economicsAtYear(a, r.rows, row.year);
      if (!e) throw Error('Missing economics');
      e.items.forEach(item => expect(item.perPassenger).toBeCloseTo(item.annual / row.passengers, 9));
      expect((e.revenuePerPassenger ?? 0) - (e.opexPerPassenger ?? 0)).toBeCloseTo(e.ebitdaPerPassenger ?? 0, 9);
      const costs = forecastOpex(a, row);
      expect(costs.cableFixed + costs.cableVariable + costs.fb + costs.merchandise + costs.other).toBeCloseTo(row.opex, 8);
      expect(e.items.filter(i => ['ticket', 'fbRevenue', 'merchRevenue', 'otherRevenue'].includes(i.key)).reduce((s,i) => s + i.annual, 0)).toBeCloseTo(row.revenue, 8);
    }
  });
  it('Year 3 comparisons and presentations share exactly the same figures', () => {
    const r = calculate(a), e = economicsAtYear(a, r.rows);
    const row = r.rows[2]; if (!row || !e) throw Error('Missing Year 3');
    expect(splitYear(a, row).revenuePerPax).toBe(e.revenuePerPassenger);
    expect(splitYear(a, row).ebitdaPerPax).toBe(e.ebitdaPerPassenger);
    const d = presentationData({ project: { name: 'QA', location: null }, scenario: { name: 'Base', kind: 'base' }, assumptions: a, result: r, assets: [], records: [] });
    expect(d.unitEconomics).toEqual(e);
  });
  it('selected operating years update all annual and unit metrics', () => {
    const r = calculate(a);
    const y1 = economicsAtYear(a, r.rows, 1), y2 = economicsAtYear(a, r.rows, 2);
    expect(y1?.year).toBe(1); expect(y2?.year).toBe(2);
    expect(y1?.items.find(i => i.key === 'fbRevenue')?.perPassenger).toBe(125);
    expect(y2?.items.find(i => i.key === 'fbRevenue')?.perPassenger).toBeCloseTo(137.5, 8);
    expect(economicsAtYear(a, r.rows, 99)).toBeNull();
  });
  it('zero passengers returns N/A-compatible null for every unit metric', () => {
    const zero = { ...a, initialPassengers: 0 }, r = calculate(zero);
    const e = economicsAtYear(zero, r.rows);
    expect(e?.items.every(i => i.perPassenger === null)).toBe(true);
    expect(e?.revenuePerPassenger).toBeNull(); expect(e?.opexPerPassenger).toBeNull(); expect(e?.ebitdaPerPassenger).toBeNull();
  });
});
