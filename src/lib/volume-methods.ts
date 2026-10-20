import type { Assumptions } from '@/financialEngine';
import type { FbSource } from './fb-benchmark';
export type RevenueMethod = 'legacy' | 'annual' | 'benchmark' | 'perPassenger';
export type OpexMethod = RevenueMethod | 'revenuePercent' | 'fixedVariable';
export type VolumeLine = { method?: OpexMethod; annualAmount?: number; perPassenger?: number; revenuePercent?: number; fixedAmount?: number; variablePerPassenger?: number };
export type VolumeCategory = { revenue?: VolumeLine; opex?: VolumeLine };
export type VolumeMethods = { fb?: VolumeCategory; merch?: VolumeCategory; other?: VolumeCategory };
export type VolumeKind = keyof VolumeMethods;
export function escalation(values: number[], year: number): number {
  let index = 1;
  for (let y = 2; y <= year; y++) index *= 1 + (values[Math.min(y - 2, values.length - 1)] ?? 0);
  return index;
}
/** Only frozen snapshots are read; unresolved legacy sources retain their saved amount. */
export function benchmarkAmount(a: Assumptions, kind: 'revenue' | 'opex'): number {
  const source = a.fbBenchmark?.[kind] as FbSource | null | undefined;
  const saved = source?.snapshot;
  const fallback = kind === 'revenue' ? a.fbRevenueYear1 : a.fbOpexYear1;
  if (!saved) return fallback;
  const adjusted = source?.adjust ?? a.fbBenchmark?.adjust;
  if (adjusted && !(saved.cableCarPassengers && saved.cableCarPassengers > 0)) return fallback;
  return saved.historicalAmount * (adjusted ? a.initialPassengers / (saved.cableCarPassengers ?? 1) : 1) * (1 + saved.manualAdjustment);
}
export function volumeRevenue(line: VolumeLine | undefined, passengers: number, index: number, legacy: number, benchmark: number, benchmarkIndex: number): number {
  switch (line?.method) {
    case 'annual': return (line.annualAmount ?? 0) * index;
    case 'benchmark': return benchmark * benchmarkIndex;
    case 'perPassenger': return passengers * (line.perPassenger ?? 0) * index;
    default: return legacy;
  }
}
export function volumeOpex(line: VolumeLine | undefined, passengers: number, revenue: number, index: number, legacy: number, benchmark: number): number {
  switch (line?.method) {
    case 'annual': return (line.annualAmount ?? 0) * index;
    case 'benchmark': return benchmark;
    case 'perPassenger': return passengers * (line.perPassenger ?? 0) * index;
    case 'revenuePercent': return revenue * (line.revenuePercent ?? 0);
    case 'fixedVariable': return ((line.fixedAmount ?? 0) + passengers * (line.variablePerPassenger ?? 0)) * index;
    default: return legacy;
  }
}
export function validateVolumeMethods(methods: VolumeMethods | undefined) {
  for (const [kind, category] of Object.entries(methods ?? {})) {
    for (const [side, line] of Object.entries(category ?? {}) as [string, VolumeLine][]) {
      if (!line.method || line.method === 'legacy') continue;
      const allowed = side === 'revenue' ? ['annual', 'benchmark', 'perPassenger'] : ['annual', 'benchmark', 'perPassenger', 'revenuePercent', 'fixedVariable'];
      if (!allowed.includes(line.method) || (line.method === 'benchmark' && kind !== 'fb')) throw Error('Invalid calculation method');
      const values = line.method === 'annual' ? [line.annualAmount ?? 0] : line.method === 'perPassenger' ? [line.perPassenger ?? 0] : line.method === 'revenuePercent' ? [line.revenuePercent ?? 0] : line.method === 'fixedVariable' ? [line.fixedAmount ?? 0, line.variablePerPassenger ?? 0] : [];
      if (values.some(v => !Number.isFinite(v) || v < 0)) throw Error('Revenue and OPEX inputs must be finite and nonnegative');
    }
  }
}

/** Converts a current Year 1 engine amount into the equivalent input for a method. Returns null when undefined (zero denominator or missing split). */
export function initializeFromYear1(method: OpexMethod, x: { amount: number; revenue: number; passengers: number; fixedShare?: number | null }): Partial<VolumeLine> | null {
  switch (method) {
    case 'annual': return { annualAmount: x.amount };
    case 'perPassenger': return x.passengers > 0 ? { perPassenger: x.amount / x.passengers } : null;
    case 'revenuePercent': return x.revenue > 0 ? { revenuePercent: x.amount / x.revenue } : null;
    case 'fixedVariable': {
      if (x.fixedShare == null || x.fixedShare < 0 || x.fixedShare > 1) return null;
      const variable = x.amount * (1 - x.fixedShare);
      if (variable > 0 && !(x.passengers > 0)) return null;
      return { fixedAmount: x.amount * x.fixedShare, variablePerPassenger: x.passengers > 0 ? variable / x.passengers : 0 };
    }
    default: return null;
  }
}
/** Which existing assumption escalates each method (applied exactly once). */
export function growthDriver(kind: VolumeKind, side: 'revenue' | 'opex', method: OpexMethod): string {
  if (side === 'revenue') {
    if (method === 'perPassenger') return 'Passenger growth × Ancillary revenue growth';
    if (method === 'benchmark') return 'Benchmark adjustment (passengers × ticket price growth) or Ancillary revenue growth';
    return 'Ancillary revenue growth';
  }
  const cost = kind === 'fb' ? 'F&B OPEX growth' : kind === 'merch' ? 'Merchandise OPEX growth' : 'Cost inflation';
  if (method === 'revenuePercent') return 'Follows corresponding revenue (no extra inflation)';
  if (method === 'perPassenger') return `Passenger growth × ${cost}`;
  if (method === 'fixedVariable') return `Fixed: ${cost}; variable: Passenger growth × ${cost}`;
  if (method === 'benchmark') return `${cost}`;
  return kind === 'merch' ? 'Merchandise OPEX % of revenue / legacy cost growth' : cost;
}
