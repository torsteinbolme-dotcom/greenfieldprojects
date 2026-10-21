import { useMemo, useState } from "react";
import type { Assumptions } from "@/financialEngine";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NumField } from "@/components/editor/inputs";
import { mult, nokM, pct, signedPct } from "@/lib/format";
import { METRIC_LABELS, reconcileZero, sensitivityMatrix, steps, VARIABLE_LABELS, type SensitivityMetric, type SensitivityVariable } from "@/lib/sensitivity";

const DEFAULTS = { rowVar: "passengers" as SensitivityVariable, colVar: "price" as SensitivityVariable, metric: "irr" as SensitivityMetric, rowRange: 0.2, rowStep: 0.1, colRange: 0.2, colStep: 0.1 };
const fmt = (m: SensitivityMetric, v: number | null) => v == null ? "—" : m === "irr" || m === "marginY3" ? pct(v) : m === "moic" ? mult(v) : nokM(v);

/** Temporary analysis on copies of the resolved scenario; never saves or changes the scenario. */
export function RiskSensitivity({ a }: { a: Assumptions }) {
  const [s, setS] = useState(DEFAULTS);
  const upd = (p: Partial<typeof DEFAULTS>) => setS((x) => ({ ...x, ...p }));
  const out = useMemo(() => {
    try {
      const m = sensitivityMatrix(a, s.rowVar, s.colVar, steps(s.rowRange, s.rowStep), steps(s.colRange, s.colStep), s.metric);
      return { m, mismatches: reconcileZero(a), error: null as string | null };
    } catch (e) { return { m: null, mismatches: [], error: (e as Error).message }; }
  }, [a, s]);
  const vars = Object.keys(VARIABLE_LABELS) as SensitivityVariable[];
  const base = out.m ? out.m.values[out.m.rows.indexOf(0)]?.[out.m.cols.indexOf(0)] ?? null : null;
  const VarSel = ({ value, label, onChange }: { value: SensitivityVariable; label: string; onChange: (v: SensitivityVariable) => void }) => (
    <Select value={value} onValueChange={(v) => onChange(v as SensitivityVariable)}>
      <SelectTrigger className="h-8 w-56" aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent>{vars.map((v) => <SelectItem key={v} value={v}>{VARIABLE_LABELS[v]}</SelectItem>)}</SelectContent>
    </Select>
  );
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted-foreground">Every cell is a full recalculation of this scenario (including any active advanced modules) with temporary percentage changes. Nothing is saved. Operating costs = cable car operating costs only (standard or Advanced Operations, step thresholds unchanged); F&amp;B, merchandise and other costs follow their own methods. CAPEX changes keep the financing split.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1"><span className="block text-xs text-muted-foreground">Rows</span><VarSel value={s.rowVar} label="Row variable" onChange={(v) => upd({ rowVar: v })} /></label>
        <label className="w-24 space-y-1"><span className="block text-xs text-muted-foreground">Range ±</span><NumField aria-label="Row range" percent value={s.rowRange} onChange={(v) => upd({ rowRange: v })} /></label>
        <label className="w-24 space-y-1"><span className="block text-xs text-muted-foreground">Step</span><NumField aria-label="Row step" percent value={s.rowStep} onChange={(v) => upd({ rowStep: v })} /></label>
        <label className="space-y-1"><span className="block text-xs text-muted-foreground">Columns</span><VarSel value={s.colVar} label="Column variable" onChange={(v) => upd({ colVar: v })} /></label>
        <label className="w-24 space-y-1"><span className="block text-xs text-muted-foreground">Range ±</span><NumField aria-label="Column range" percent value={s.colRange} onChange={(v) => upd({ colRange: v })} /></label>
        <label className="w-24 space-y-1"><span className="block text-xs text-muted-foreground">Step</span><NumField aria-label="Column step" percent value={s.colStep} onChange={(v) => upd({ colStep: v })} /></label>
        <label className="space-y-1"><span className="block text-xs text-muted-foreground">Output</span>
          <Select value={s.metric} onValueChange={(v) => upd({ metric: v as SensitivityMetric })}>
            <SelectTrigger className="h-8 w-52" aria-label="Output metric"><SelectValue /></SelectTrigger>
            <SelectContent>{(Object.keys(METRIC_LABELS) as SensitivityMetric[]).map((m) => <SelectItem key={m} value={m}>{METRIC_LABELS[m]}</SelectItem>)}</SelectContent>
          </Select>
        </label>
        <Button size="sm" variant="outline" onClick={() => setS(DEFAULTS)}>Reset</Button>
      </div>
      {out.error && <div className="rounded-md bg-warning p-3 text-warning-foreground">{out.error}</div>}
      {out.m && (
        <div className="overflow-x-auto">
          <table className="text-xs">
            <thead><tr><th className="p-1 text-left text-muted-foreground">{VARIABLE_LABELS[s.rowVar]} ↓ / {VARIABLE_LABELS[s.colVar]} →</th>{out.m.cols.map((c) => <th key={c} className="p-1 text-right">{signedPct(c, 0)}</th>)}</tr></thead>
            <tbody>{out.m.rows.map((rv, i) => (
              <tr key={rv} className="border-t border-border/50">
                <th className="p-1 text-left">{signedPct(rv, 0)}</th>
                {out.m!.cols.map((cv, j) => {
                  const v = out.m!.values[i]![j]!, isBase = rv === 0 && cv === 0;
                  const tone = v == null || base == null || isBase ? "" : v > base ? "text-success" : v < base ? "text-destructive" : "";
                  return <td key={cv} title={out.m!.errors[i]![j] ?? undefined} className={`whitespace-nowrap px-2 py-1 text-right ${tone} ${isBase ? "rounded bg-primary font-semibold text-primary-foreground" : ""}`}>{fmt(s.metric, v)}</td>;
                })}
              </tr>
            ))}</tbody>
          </table>
          <p className="mt-1 text-xs text-muted-foreground">Highlighted: the saved scenario (0% / 0%). Green is better and red is worse than the saved scenario.</p>
        </div>
      )}
      {!out.error && (out.mismatches.length === 0
        ? <p className="text-xs text-muted-foreground">Reconciliation: at 0% every forecast year and financial output matches the saved scenario (tolerance 1e-7 NOK absolute or 1e-12 relative).</p>
        : <div className="rounded-md bg-warning p-3 text-xs text-warning-foreground"><div className="font-medium">Reconciliation mismatches at 0%:</div>{out.mismatches.slice(0, 20).map((m) => <div key={m.metric}>{m.metric}: baseline {String(m.baseline)}, sensitivity {String(m.sandbox)}, difference {String(m.difference)}</div>)}</div>)}
    </div>
  );
}
