import type { Assumptions } from "@/financialEngine";
import { Field, NumField } from "./inputs";
import { benchmarkOpexEscalation, benchmarkOpexYears } from "@/lib/benchmark-inflation";
import { pct } from "@/lib/format";

/**
 * One shared annual rate that carries benchmark-sourced OPEX (restaurant and cable car) from the
 * benchmark's reported year to the project's opening year. Both benchmark panels edit this same
 * scenario assumption; benchmark revenue is never escalated.
 */
export function BenchmarkInflationField({
  a,
  set,
  ro,
  benchmarkYear,
}: {
  a: Assumptions;
  set: (p: Partial<Assumptions>) => void;
  ro: boolean;
  benchmarkYear?: number | null;
}) {
  const rate = a.benchmarkOpexInflation ?? 0;
  const years = benchmarkYear == null ? 0 : benchmarkOpexYears(benchmarkYear, a.openingYear);
  const factor = benchmarkOpexEscalation(a, benchmarkYear ?? a.openingYear);
  return (
    <div className="max-w-xs space-y-1">
      <Field label="Benchmark OPEX inflation (annual)">
        <NumField percent value={rate} disabled={ro} aria-label="Benchmark OPEX inflation" onChange={(v) => set({ benchmarkOpexInflation: v })} />
      </Field>
      <p className="text-[11px] text-muted-foreground">
        {benchmarkYear == null
          ? "Applies to selected restaurant and cable car OPEX benchmarks."
          : years > 0
            ? `Carries benchmark costs from ${benchmarkYear} to the ${a.openingYear} opening year: ${years} year${years > 1 ? "s" : ""} = ${pct(factor - 1)} more.`
            : "No gap to carry: the benchmark year is the opening year or later."}
      </p>
    </div>
  );
}
