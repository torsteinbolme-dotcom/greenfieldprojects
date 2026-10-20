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
