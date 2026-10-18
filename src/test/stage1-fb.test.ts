import { describe, expect, it } from 'vitest';
import { calculate } from '@/financialEngine';
import { projectMountain } from '@/exampleProject';
import { withFbBenchmark, snapshotSource, type AssumptionsWithFb } from '@/lib/fb-benchmark';
import { bridgeValues } from '@/lib/ebitda-bridge';
import type { BenchmarkAsset, BenchmarkRecord } from '@/lib/benchmarks';
const assets: BenchmarkAsset[] = [
  { id: 'r', organization_id: 'o', name: 'Hoven', business_type: 'fnb', parent_asset_id: 'c', location: null },
  { id: 's', organization_id: 'o', name: 'Eggen', business_type: 'fnb', parent_asset_id: 'd', location: null },
  ...['c','d'].map(id => ({ id, organization_id: 'o', name: id, business_type: 'cable_car' as const, parent_asset_id: null, location: null })),
];
const record = (asset_id: string, values: Partial<BenchmarkRecord>): BenchmarkRecord => ({ id: asset_id, organization_id: 'o', asset_id, financial_year: 2025, passengers: null, revenue: null, opex: null, ebitda: null, currency: 'NOK', source: null, data_status: 'actual', comparability_notes: null, ...values });
const records = [record('r', { revenue: 100000, opex: 60000 }), record('s', { revenue: 200000, opex: 150000 }), record('c', { passengers: 10000 }), record('d', { passengers: 20000 })];
function setup(revenue: boolean, opex: boolean) {
  return withFbBenchmark({ ...projectMountain, initialPassengers: 30000, passengerGrowth: [0.1], priceGrowth: [0.02], costInflation: 0.03, ancillaryGrowth: [0.04], fbBenchmark: { adjust: true, revenue: { assetId: 'r', year: 2025, adjust: revenue }, opex: { assetId: 's', year: 2025, adjust: opex } } } as AssumptionsWithFb, assets, records);
}
describe('Stage 1 restaurant snapshots and independent scaling', () => {
  it('ON scales revenue from its cable car and applies passenger and price growth once', () => {
    const a = setup(true, true);
    expect(calculate(a).rows[2]?.fbRevenue).toBeCloseTo(100000 * 30000 / 10000 * 1.1 ** 2 * 1.02 ** 2);
  });
  it('OFF revenue uses historical revenue and ancillary escalation only', () => {
    const a = setup(false, true);
    expect(calculate(a).rows[2]?.fbRevenue).toBeCloseTo(100000 * 1.04 ** 2);
  });
  it('OFF OPEX uses historical OPEX and cost inflation only independently of linked revenue', () => {
    const a = setup(true, false), row = calculate(a).rows[2];
    if (!row) throw Error('Missing year');
    expect(bridgeValues(a, row).fb.opex).toBeCloseTo(150000 * 1.03 ** 2);
  });
  it('ON OPEX scales its own cable car passengers once independently of unscaled revenue', () => {
    const a = setup(false, true), row = calculate(a).rows[2];
    if (!row) throw Error('Missing year');
    expect(bridgeValues(a, row).fb.opex).toBeCloseTo(150000 * 30000 / 20000 * 1.1 ** 2 * 1.03 ** 2);
  });
  it('central source changes do not alter saved snapshots', () => {
    const a = setup(true, true);
    const changed = records.map(r => ({ ...r, revenue: 999999, opex: 888888, passengers: 55555 }));
    const b = withFbBenchmark(a, [], changed);
    expect(b).toEqual(a);
    expect(calculate(b)).toEqual(calculate(a));
  });
  it('explicit refresh freezes changed data without mutating the old version', () => {
    const a = setup(true, true), source = a.fbBenchmark?.revenue;
    if (!source) throw Error('Missing source');
    const next = snapshotSource(a, 'revenue', source, true, assets, records.map(r => r.asset_id === 'r' ? { ...r, revenue: 200000 } : r));
    expect(next.snapshot?.historicalAmount).toBe(200000);
    expect(source.snapshot?.historicalAmount).toBe(100000);
  });
  it('changed annual passengers update ON amounts but never OFF amounts', () => {
    const on = withFbBenchmark({ ...setup(true, true), initialPassengers: 40000 }, [], []);
    const off = withFbBenchmark({ ...setup(false, false), initialPassengers: 40000 }, [], []);
    expect(on.fbRevenueYear1).toBe(400000);
    expect(off.fbRevenueYear1).toBe(100000);
    expect(calculate(on).rows[2]?.passengers).toBeCloseTo(48400);
  });
  it('legacy selections migrate to frozen sources and unavailable selections retain amounts', () => {
    const a = withFbBenchmark({ ...projectMountain, fbBenchmark: { adjust: true, revenue: { assetId: 'r', year: 2025 } } } as AssumptionsWithFb, assets, records);
    expect(a.fbBenchmark?.revenue?.snapshot?.name).toBe('Hoven');
    const missing = withFbBenchmark({ ...projectMountain, fbBenchmark: { adjust: true, revenue: { assetId: 'missing', year: 2025 } } } as AssumptionsWithFb, assets, records);
    expect(missing.fbRevenueYear1).toBe(projectMountain.fbRevenueYear1);
  });
  it('manual scenario calculations and input identity remain unchanged', () => {
    expect(withFbBenchmark(projectMountain, assets, records)).toBe(projectMountain);
    expect(calculate(withFbBenchmark(projectMountain, assets, records))).toEqual(calculate(projectMountain));
  });
  it('bridge reconciles every operating year for all four switch combinations', () => {
    for (const rev of [false,true]) for (const op of [false,true]) {
      const a = setup(rev, op);
      for (const row of calculate(a).rows) {
        const b = bridgeValues(a, row);
        expect(b.cable.revenue + b.fb.revenue + b.merchandise.revenue + b.unallocated.revenue).toBeCloseTo(row.revenue);
        expect(b.cable.opex + b.fb.opex + b.merchandise.opex + b.unallocated.opex).toBeCloseTo(row.opex);
        expect(b.cable.ebitda + b.fb.ebitda + b.merchandise.ebitda + b.unallocated.revenue - b.unallocated.opex).toBeCloseTo(row.ebitda);
        expect(b.total.revenue - b.total.opex).toBeCloseTo(b.total.ebitda);
      }
    }
  });
});
