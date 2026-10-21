import { describe, expect, it } from 'vitest';
import { calculate } from '@/financialEngine';
import { projectMountain } from '@/exampleProject';
import { cableOpexAmount, cableOpexSnapshot, clearCableOpexBenchmark, selectCableOpexBenchmark, withCableOpexBenchmark } from '@/lib/cable-opex-benchmark';
import type { BenchmarkAsset, BenchmarkRecord } from '@/lib/benchmarks';
const snapshot = { assetId: 'cable', name: 'Cable', year: 2025, opex: 2000000, passengers: 100000 };
const base = { ...projectMountain, initialPassengers: 200000, cableFixedOpex: 7000000, cableVariableCostPerPassenger: 12, passengerGrowth: [0.5], opexGrowth: { ...projectMountain.opexGrowth, cable: [0.1] } };
describe('Cable car benchmark OPEX', () => {
  it('scales Year 1 benchmark OPEX to project passengers', () => {
    expect(selectCableOpexBenchmark(base, snapshot).cableFixedOpex).toBe(4000000);
  });
  it('does not add existing variable costs to total benchmark OPEX', () => {
    expect(selectCableOpexBenchmark(base, snapshot).cableVariableCostPerPassenger).toBe(0);
  });
  it('unadjusted selection uses historical annual costs', () => {
    expect(selectCableOpexBenchmark(base, snapshot, false).cableFixedOpex).toBe(2000000);
  });
  it('uses cable cost growth once after Year 1, not passenger growth again', () => {
    const a = selectCableOpexBenchmark(base, snapshot);
    const withoutCable = calculate({ ...a, cableFixedOpex: 0 });
    const result = calculate(a);
    expect((result.rows[1]?.opex ?? 0) - (withoutCable.rows[1]?.opex ?? 0)).toBeCloseTo(4400000, 6);
  });
  it('recalculates from the saved snapshot when Year 1 passengers change', () => {
    const selected = selectCableOpexBenchmark(base, snapshot);
    expect(withCableOpexBenchmark({ ...selected, initialPassengers: 300000 }).cableFixedOpex).toBe(6000000);
  });
  it('restores both manual inputs after switching benchmarks and returning to Manual', () => {
    const a = selectCableOpexBenchmark(selectCableOpexBenchmark(base, snapshot), { ...snapshot, opex: 1000000 });
    const restored = clearCableOpexBenchmark(a);
    expect(restored.cableFixedOpex).toBe(7000000);
    expect(restored.cableVariableCostPerPassenger).toBe(12);
  });
  it('preserves all manual financial results when not selected', () => {
    expect(withCableOpexBenchmark(base)).toBe(base);
    expect(calculate(withCableOpexBenchmark(base))).toEqual(calculate(base));
  });
  it('retains the last applied costs when a snapshot cannot scale', () => {
    const a = selectCableOpexBenchmark(base, snapshot);
    const invalid = { ...a, cableOpexBenchmark: a.cableOpexBenchmark ? { ...a.cableOpexBenchmark, snapshot: { ...snapshot, passengers: 0 } } : null };
    expect(withCableOpexBenchmark(invalid).cableFixedOpex).toBe(4000000);
    expect(cableOpexAmount({ ...snapshot, passengers: null }, true, 200000)).toBeNull();
  });
  it('keeps snapshots and source assumptions isolated through a JSON save/reload', () => {
    const a = selectCableOpexBenchmark(base, snapshot);
    const reload = JSON.parse(JSON.stringify(a));
    const changed = withCableOpexBenchmark({ ...reload, initialPassengers: 300000 });
    expect(changed.cableFixedOpex).toBe(6000000);
    expect(a.cableFixedOpex).toBe(4000000);
    expect(base.cableFixedOpex).toBe(7000000);
    expect(clearCableOpexBenchmark(reload).cableVariableCostPerPassenger).toBe(12);
  });
  it('freezes newest usable NOK record with actual preferred in its year', () => {
    const assets = [{ id: 'cable', name: 'Cable', business_type: 'cable_car' }] as BenchmarkAsset[];
    const records = [{ asset_id: 'cable', financial_year: 2025, currency: 'NOK', opex: 2000000, passengers: 100000, data_status: 'actual' }, { asset_id: 'cable', financial_year: 2025, currency: 'NOK', opex: 3000000, passengers: 100000, data_status: 'budget' }, { asset_id: 'cable', financial_year: 2026, currency: 'NOK', opex: null }] as BenchmarkRecord[];
    expect(cableOpexSnapshot('cable', assets, records)).toEqual(snapshot);
    records[0] = { ...records[0], opex: 9000000 } as BenchmarkRecord;
    expect(snapshot.opex).toBe(2000000);
  });
});