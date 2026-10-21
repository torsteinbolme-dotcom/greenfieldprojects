import type { Assumptions } from '@/financialEngine';
import type { BenchmarkAsset, BenchmarkRecord } from './benchmarks';

export type CableOpexSnapshot = { assetId: string; name: string; year: number; opex: number; passengers: number | null };
export type CableOpexBenchmark = {
  snapshot: CableOpexSnapshot; adjust: boolean;
  manual: { fixed: number; variable: number };
};
export type AssumptionsWithCableBenchmark = Assumptions & { cableOpexBenchmark?: CableOpexBenchmark | null };

/** Freeze the latest usable cost record; actual wins over other statuses in the same year. */
export function cableOpexSnapshot(assetId: string, assets: BenchmarkAsset[], records: BenchmarkRecord[]): CableOpexSnapshot | null {
  const asset = assets.find(x => x.id === assetId && x.business_type === 'cable_car');
  const record = records.filter(x => x.asset_id === assetId && x.currency === 'NOK' && x.opex != null && Number.isFinite(x.opex) && x.opex >= 0)
    .sort((a, b) => b.financial_year - a.financial_year || Number(b.data_status === 'actual') - Number(a.data_status === 'actual'))[0];
  if (!asset || !record || record.opex == null) return null;
  return { assetId, name: asset.name, year: record.financial_year, opex: record.opex, passengers: record.passengers };
}

export function cableOpexAmount(snapshot: CableOpexSnapshot, adjust: boolean, passengers: number): number | null {
  if (!Number.isFinite(snapshot.opex) || snapshot.opex < 0) return null;
  if (!adjust) return snapshot.opex;
  if (snapshot.passengers == null || !Number.isFinite(snapshot.passengers) || snapshot.passengers <= 0 || !Number.isFinite(passengers) || passengers < 0) return null;
  return snapshot.opex * passengers / snapshot.passengers;
}

/** Apply total benchmark OPEX through existing annual inputs, never adding manual variable costs twice. */
export function withCableOpexBenchmark<T extends AssumptionsWithCableBenchmark>(a: T): T {
  const selection = a.cableOpexBenchmark;
  if (!selection) return a;
  const amount = cableOpexAmount(selection.snapshot, selection.adjust, a.initialPassengers);
  if (amount == null) return a;
  return { ...a, cableFixedOpex: amount, cableVariableCostPerPassenger: 0 };
}

export function selectCableOpexBenchmark(a: AssumptionsWithCableBenchmark, snapshot: CableOpexSnapshot, adjust = true): AssumptionsWithCableBenchmark {
  return withCableOpexBenchmark({ ...a, cableOpexBenchmark: {
    snapshot, adjust, manual: a.cableOpexBenchmark?.manual ?? { fixed: a.cableFixedOpex, variable: a.cableVariableCostPerPassenger ?? 0 },
  } });
}

export function clearCableOpexBenchmark(a: AssumptionsWithCableBenchmark): AssumptionsWithCableBenchmark {
  const saved = a.cableOpexBenchmark?.manual;
  return { ...a, cableOpexBenchmark: null, ...(saved ? { cableFixedOpex: saved.fixed, cableVariableCostPerPassenger: saved.variable } : {}) };
}