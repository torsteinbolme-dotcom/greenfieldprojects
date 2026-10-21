import { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { Entry } from './selection';
import { Button } from '@/components/ui/button';
import { Field, NumField } from '@/components/editor/inputs';
import { baselineTargets, normalizeFromYear1, simulateSandbox, type SandboxCase, type SandboxTargets } from '@/lib/sandbox';
import { irrAtYear, moicAtYear } from '@/lib/portfolio';
import { forecastOpex } from '@/lib/forecast-opex';
import { deltaClass, formatNumber, mult, nokM, pct, signedNum, signedPct } from '@/lib/format';

type Metric = { label: string; format?: 'pct' | 'mult' | 'count' | 'money'; get: (c: SandboxCase) => number | null | undefined };
const row = (c: SandboxCase) => c.result.rows[2];
export const metrics: Metric[] = [
  { label: 'MOIC Y8', format: 'mult', get: c => moicAtYear(c.assumptions, c.result) },
  { label: 'IRR Y8', format: 'pct', get: c => irrAtYear(c.assumptions, c.result) },
  { label: 'EBITDA Y3 (NOK)', format: 'money', get: c => row(c)?.ebitda },
  { label: 'Revenue Y3 (NOK)', format: 'money', get: c => row(c)?.revenue },
];
export const value = (v: number | null | undefined, f?: Metric['format']) => v == null || !Number.isFinite(v) ? 'N/A' : f === 'pct' ? pct(v, 2) : f === 'mult' ? mult(v) : formatNumber(v, 0, f === 'count' || f === 'money' ? 0 : 2);
export const delta = (a: number | null | undefined, b: number | null | undefined, f?: Metric['format']) => {
  if (a == null || b == null) return { text: 'N/A', relative: '' };
  const d = b - a;
  return { text: f === 'pct' ? `${signedNum(d * 100, 2)} pp` : f === 'mult' ? `${signedNum(d, 2)}x` : signedNum(d, f === 'count' || f === 'money' ? 0 : 2), relative: f !== 'pct' && a !== 0 ? signedPct(d / Math.abs(a), 2) : '' };
};

function ProjectSimulation({ entry, targets, onChange, onReset }: { entry: Entry; targets?: SandboxTargets | undefined; onChange: (v: SandboxTargets) => void; onReset: () => void }) {
  const baseline = useMemo(() => ({ assumptions: entry.a, result: entry.result }), [entry.a, entry.result]);
  const base = baselineTargets(entry.result);
  const requested = targets ?? base;
  const simulation = useMemo(() => {
    try { return { data: simulateSandbox(entry.a, targets), error: null }; }
    catch (e) { return { data: null, error: e instanceof Error ? e.message : 'Unable to calculate.' }; }
  }, [entry.a, targets]);
  const pairs = useMemo(() => simulation.data ? metrics.map(m => ({ m, a: m.get(baseline), b: m.get(simulation.data as SandboxCase) })) : [], [baseline, simulation.data]);
  return <article className="min-w-0 space-y-4 border-t pt-5" aria-label={`Sandbox ${entry.project.name}`}>
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-lg font-semibold">{entry.project.name}</h2><p className="text-sm text-muted-foreground">{entry.scenario.name} · CAPEX {nokM(entry.result.capex)} NOK m · Exit Year {entry.a.exitYear} ({entry.a.openingYear + entry.a.exitYear - 1})</p></div><Button variant="outline" size="sm" onClick={onReset}><RotateCcw className="mr-1 h-4 w-4" />Reset project</Button></div>
    {base && requested ? <>
      <p className="text-xs text-muted-foreground">Baseline Year 3: {value(base.passengers, 'count')} passengers · {value(base.ticketPrice)} NOK average net ticket price</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Field label="Year 3 passengers"><NumField aria-label={`${entry.project.name} Year 3 passengers`} value={requested.passengers} disabled={base.passengers <= 0} onChange={v => onChange({ ...requested, passengers: v })} /></Field>
        <Field label="Passenger change"><NumField aria-label={`${entry.project.name} passenger change`} percent value={base.passengers > 0 ? requested.passengers / base.passengers - 1 : 0} disabled={base.passengers <= 0} onChange={v => onChange({ ...requested, passengers: base.passengers * (1 + v) })} /></Field>
        <Field label="Average net ticket price Y3 (NOK)"><NumField aria-label={`${entry.project.name} average net ticket price`} value={requested.ticketPrice} disabled={base.ticketPrice <= 0} onChange={v => onChange({ ...requested, ticketPrice: v })} /></Field>
        <Field label="Ticket price change"><NumField aria-label={`${entry.project.name} ticket price change`} percent value={base.ticketPrice > 0 ? requested.ticketPrice / base.ticketPrice - 1 : 0} disabled={base.ticketPrice <= 0} onChange={v => onChange({ ...requested, ticketPrice: base.ticketPrice * (1 + v) })} /></Field>
      </div>
      <p className="text-xs text-muted-foreground">Effective net fare · excluding VAT and after Cruise / Tour operator commissions</p>
      {(base.passengers <= 0 || base.ticketPrice <= 0) && <p className="text-sm text-warning-foreground">Zero baseline values cannot be scaled; the corresponding adjustment is unavailable.</p>}
    </> : <p className="text-warning-foreground">Year 3 is outside this scenario’s forecast horizon.</p>}
    {simulation.error && <p role="alert" className="text-sm text-destructive">{simulation.error}</p>}
    {simulation.data && <>
      <div className="overflow-x-auto"><table className="fin-table"><thead><tr><th>Metric</th><th className="text-right text-muted-foreground">Baseline</th><th className="text-right text-primary">Sandbox</th><th className="text-right">Difference</th></tr></thead><tbody>{pairs.map(({ m, a, b }) => { const d = delta(a, b, m.format); return <tr key={m.label}><td>{m.label}</td><td className="num whitespace-nowrap text-right text-muted-foreground">{value(a, m.format)}</td><td className="num whitespace-nowrap text-right font-semibold">{value(b, m.format)}</td><td className={`num whitespace-nowrap text-right ${deltaClass(d.text)}`}>{d.text}{d.relative && <div className="text-xs">{d.relative}</div>}</td></tr>; })}</tbody></table></div>
      <details><summary className="cursor-pointer text-sm font-medium">Annual financial results · baseline / Sandbox</summary><AnnualResults baseline={baseline} simulation={simulation.data} /></details>
    </>}
  </article>;
}

function AnnualResults({ baseline, simulation }: { baseline: SandboxCase; simulation: SandboxCase }) {
  const annual = {
    passengers: 'Passengers', ticketNetPrice: 'Net ticket price', ticketRevenue: 'Ticket revenue', fbRevenue: 'F&B revenue', merchRevenue: 'Merchandise revenue', otherRevenue: 'Other revenue', revenue: 'Total revenue', opex: 'Total OPEX', ebitda: 'EBITDA', depreciation: 'Depreciation', ebit: 'EBIT', openingDebt: 'Opening debt', interest: 'Interest', principal: 'Principal', closingDebt: 'Closing debt', tax: 'Taxes', maintenanceCapex: 'Maintenance CAPEX', equityInjection: 'Additional equity', cashAfterDebt: 'Cash after debt service', distribution: 'Distributions', retainedCash: 'Retained cash', dscr: 'DSCR',
  } as const;
  return <div className="mt-3 overflow-x-auto"><table className="fin-table"><thead><tr><th>Operating year</th>{Object.entries(annual).map(([k, label]) => <th key={k} className="text-right">{label}</th>)}<th>Operating cash flow</th><th>Free cash flow</th><th>Cable fixed OPEX</th><th>Cable variable OPEX</th><th>F&B OPEX</th><th>Merchandise OPEX</th><th>Other OPEX</th><th>Equity cash flow</th></tr></thead><tbody>{simulation.result.rows.map((r, i) => {
    const b = baseline.result.rows[i];
    if (!b) return null;
    const c = forecastOpex(simulation.assumptions, r), bc = forecastOpex(baseline.assumptions, b);
    const pair = (left: number | null | undefined, right: number | null | undefined) => <><div className="text-xs text-muted-foreground">{value(left)}</div><div className="font-medium">{value(right)}</div></>;
    return <tr key={r.year}><td className="whitespace-nowrap">Y{r.year} · {r.calendarYear}</td>{(Object.keys(annual) as (keyof typeof annual)[]).map(k => <td key={k} className="num whitespace-nowrap text-right">{pair(k === 'otherRevenue' ? b[k] ?? 0 : b[k], k === 'otherRevenue' ? r[k] ?? 0 : r[k])}</td>)}<td className="num whitespace-nowrap">{pair(b.ebitda - b.tax, r.ebitda - r.tax)}</td><td className="num whitespace-nowrap">{pair(b.ebitda - b.tax - b.maintenanceCapex, r.ebitda - r.tax - r.maintenanceCapex)}</td>{(['cableFixed', 'cableVariable', 'fb', 'merchandise', 'other'] as const).map(k => <td key={k} className="num whitespace-nowrap">{pair(bc[k], c[k])}</td>)}<td className="num whitespace-nowrap">{pair(baseline.result.cashflows[r.year], simulation.result.cashflows[r.year])}</td></tr>;
  })}</tbody></table><p className="mt-2 text-xs text-muted-foreground">NOK unless passengers or DSCR · cash flows exclude noncash depreciation · returns stop at the selected exit year</p></div>;
}

export function SandboxComparison({ entries }: { entries: Entry[] }) {
  const [adjustments, setAdjustments] = useState<Record<string, SandboxTargets>>({});
  const [normalize, setNormalize] = useState<SandboxTargets>({ passengers: 250000, ticketPrice: 500 });
  const [skipped, setSkipped] = useState(0);
  const key = (e: Entry) => `${e.project.id}:${e.scenario.id}:${JSON.stringify(e.a)}`;
  const apply = () => {
    const updates: Record<string, SandboxTargets> = {};
    let unnormalized = 0;
    for (const e of entries) { const t = normalizeFromYear1(e.result, normalize); if (t) updates[key(e)] = t; else unnormalized += 1; }
    setSkipped(unnormalized);
    setAdjustments(previous => ({ ...previous, ...updates }));
  };
  return <section className="space-y-5" aria-label="Sandbox Mode">
    <div className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-primary bg-muted p-3"><p className="text-sm font-medium">Sandbox Mode — Simulated values. Original projects remain unchanged.</p><Button size="sm" variant="outline" onClick={() => setAdjustments({})}><RotateCcw className="mr-1 h-4 w-4" />Reset All</Button></div>
    <section className="space-y-3" aria-label="Normalize Projects"><h2 className="font-semibold">Normalize Projects</h2><div className="flex flex-wrap items-end gap-3"><Field label="Target Year 1 passengers"><NumField aria-label="Normalize Year 1 passengers" value={normalize.passengers} onChange={v => setNormalize(n => ({ ...n, passengers: v }))} /></Field><Field label="Target average net ticket price Y1 (NOK)"><NumField aria-label="Normalize Year 1 average net ticket price" value={normalize.ticketPrice} onChange={v => setNormalize(n => ({ ...n, ticketPrice: v }))} /></Field><Button onClick={apply} disabled={!entries.length || normalize.passengers < 0 || normalize.ticketPrice < 0}>Apply to Selected Projects</Button></div><p className="text-xs text-muted-foreground">Each selected project is set to these Year 1 values and keeps its own growth into later years.</p>{skipped > 0 && <p className="text-sm text-warning-foreground">{skipped} project(s) have no usable Year 1 baseline and were left unchanged.</p>}{entries.length > 0 && <div className="space-y-1"><p className="text-xs font-medium">Actual Year 1 values in the selected projects</p><div className="overflow-x-auto"><table className="fin-table"><thead><tr><th>Project</th><th className="text-right text-muted-foreground">Year 1 passengers</th><th className="text-right text-muted-foreground">Year 1 average net ticket price (NOK)</th></tr></thead><tbody>{entries.map(e => { const y1 = e.result.rows[0]; return <tr key={key(e)}><td className="whitespace-nowrap">{e.project.name}<span className="text-xs text-muted-foreground"> · {e.scenario.name}</span></td><td className="num whitespace-nowrap text-right">{y1 ? formatNumber(y1.passengers, 0, 0) : 'N/A'}</td><td className="num whitespace-nowrap text-right">{y1 ? formatNumber(y1.ticketNetPrice, 0, 2) : 'N/A'}</td></tr>; })}</tbody></table></div></div>}</section>
    {!entries.length && <p className="text-sm text-muted-foreground">No projects selected.</p>}
    <div className="grid gap-6">{entries.map(e => <ProjectSimulation key={key(e)} entry={e} targets={adjustments[key(e)]} onChange={v => setAdjustments(p => ({ ...p, [key(e)]: v }))} onReset={() => setAdjustments(p => { const n = { ...p }; delete n[key(e)]; return n; })} />)}</div>
  </section>;
}