import type { Assumptions } from "@/financialEngine";

/**
 * Benchmark figures are reported for a past financial year (e.g. 2025) while a greenfield project
 * may open years later (e.g. 2030). This carries benchmark-sourced OPEX — restaurant and cable car
 * — forward to the project's opening year at the scenario's own annual rate. The rate is optional:
 * absent or zero means no escalation, so every saved scenario keeps its current results. Benchmark
 * revenue is deliberately never escalated here; only costs are.
 */
export function benchmarkOpexYears(benchmarkYear: number, openingYear: number): number {
  const years = Math.trunc(openingYear) - Math.trunc(benchmarkYear);
  return Number.isFinite(years) && years > 0 ? years : 0;
}

/** Compounded cost multiplier from the benchmark year to the opening year (1 when nothing applies). */
export function benchmarkOpexEscalator(benchmarkYear: number, openingYear: number, rate: number | undefined): number {
  if (rate == null || !Number.isFinite(rate) || rate === 0) return 1;
  const years = benchmarkOpexYears(benchmarkYear, openingYear);
  return years > 0 ? Math.pow(1 + rate, years) : 1;
}

/** Escalator for the OPEX a scenario takes from its selected benchmarks. */
export const benchmarkOpexEscalation = (
  a: Pick<Assumptions, "openingYear" | "benchmarkOpexInflation">,
  benchmarkYear: number,
): number => benchmarkOpexEscalator(benchmarkYear, a.openingYear, a.benchmarkOpexInflation);
