import type { Assumptions } from '@/financialEngine';
import type { ModelResult } from './model';
import type { BenchmarkAsset, BenchmarkRecord } from './benchmarks';
import { weightedBenchmark, weightsValid, type BenchmarkConfig } from './project-benchmarks';
import { year3Row, performanceYearOf } from './year3';
import { bridgeValues } from './ebitda-bridge';
import { breakEven } from './break-even';
import { allocationValid, capacityInputsValid, capacityOf, capacityTable } from './capacity';

export type PresentationType = 'executive' | 'investment' | 'detailed';
export type PresentationOptions = { type: PresentationType; charts: boolean; benchmarks: boolean; notes: boolean };
export const DEFAULT_PRESENTATION_OPTIONS: PresentationOptions = { type: 'investment', charts: true, benchmarks: true, notes: true };
export type PresentationInput = {
  project: { name: string; location: string | null; description?: string | null; assumption_notes?: string | null; benchmark_config: unknown };
  scenario: { name: string; kind: string };
  assumptions: Assumptions; result: ModelResult;
  assets: BenchmarkAsset[]; records: BenchmarkRecord[];
  version?: number | undefined;
};

/** Read-only snapshot of the very same result shown in Investment Summary. */
export function presentationData(input: PresentationInput) {
  const { assumptions: a, result: r } = input;
  const y3 = year3Row(r);
  const perf = r.rows[performanceYearOf(a, r) - 1] ?? null;
  const cfg = (input.project.benchmark_config ?? {}) as BenchmarkConfig;
  const benchmarkYear = cfg.benchmarkYear ?? 2025;
  const validWeights = weightsValid(cfg.cable) && weightsValid(cfg.fnb);
  // Do not silently interpret foreign-currency records as NOK.
  const nokRecords = input.records.filter(x => x.currency === 'NOK');
  const benchmark = validWeights ? weightedBenchmark(cfg, input.assets, nokRecords, benchmarkYear) : null;
  const selected = input.assets.filter(x => (cfg.cable?.[x.id] ?? cfg.fnb?.[x.id] ?? 0) > 0);
  const c = capacityOf(a);
  const capacity = y3 && capacityInputsValid(c) && allocationValid(c.monthlyAllocation) ? capacityTable(y3, c) : null;
  return { ...input, y3, perf, split: y3 ? bridgeValues(a, y3) : null,
    breakEven: y3 ? breakEven(a, 3) : null, capacity, benchmark, benchmarkYear, selected,
    maintenance: r.rows.slice(0, a.exitYear).reduce((s, x) => s + x.maintenanceCapex, 0),
    exit: r.rows[a.exitYear - 1] ?? null,
  };
}
export type PresentationData = ReturnType<typeof presentationData>;