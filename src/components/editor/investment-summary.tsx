import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Assumptions } from '@/financialEngine';
import type { ModelResult } from '@/lib/model';
import { bridgeValues } from '@/lib/ebitda-bridge';
import { performanceYearOf } from '@/lib/year3';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { int, mult, nok, nokM, pct } from '@/lib/format';
import { Kpi } from './sections';
import { EbitdaBridge } from './ebitda-bridge';
import { BreakEvenPanel } from './break-even';

function DevelopmentChart({ title, data, lines, passengers = false, bar = false }: { title: string; data: { year: number; [key: string]: number }[]; lines: string[]; passengers?: boolean; bar?: boolean }) {
  // Recharts does not process axis children wrapped in a JSX fragment — pass them as an array.
  const axes = [<CartesianGrid key="grid" stroke="var(--border)" vertical={false} />, <XAxis key="x" dataKey="year" tickFormatter={v => `Y${v}`} />, <YAxis key="y" width={80} tickFormatter={v => passengers ? int(Number(v)) : nokM(Number(v))} />, <Tooltip key="tip" labelFormatter={v => `Operating year ${v}`} formatter={(v, name) => [passengers ? int(Number(v)) : nokM(Number(v)), String(name)]} />, <Legend key="legend" />];
  return <section className="min-w-0 space-y-3"><h3 className="font-semibold">{title}{!passengers && ' · NOK m'}</h3><div className="h-64"><ResponsiveContainer width="100%" height="100%">{bar ? <BarChart data={data}>{axes}{lines.map((line,i) => <Bar key={line} dataKey={line} fill={`var(--chart-${i + 1})`} isAnimationActive={false} />)}</BarChart> : <LineChart data={data}>{axes}{lines.map((line,i) => <Line key={line} dataKey={line} stroke={`var(--chart-${i + 1})`} strokeWidth={2} dot={false} isAnimationActive={false} />)}</LineChart>}</ResponsiveContainer></div></section>;
}
export function InvestmentSummary({ a, r, name, location, onPerformanceYear, onExitYear }: { a: Assumptions; r: ModelResult; name: string; location: string | null; onPerformanceYear?: (year: number) => void; onExitYear?: (year: number) => void }) {
  const perfYear = performanceYearOf(a, r);
  const perfRow = r.rows[perfYear - 1];
  const exit = r.rows[a.exitYear - 1];
  const split = perfRow ? bridgeValues(a, perfRow) : null;
  const development = r.rows.map(row => ({ year: row.year, Revenue: row.revenue, EBITDA: row.ebitda, Passengers: row.passengers }));
  const cashflows = r.cashflows.map((flow, year) => ({ year, 'Equity cash flow': flow }));
  const perfSelect = onPerformanceYear && <Select value={String(perfYear)} onValueChange={v => onPerformanceYear(Number(v))}><SelectTrigger className="h-7 w-24 text-sm"><SelectValue /></SelectTrigger><SelectContent>{r.rows.map(row => <SelectItem key={row.year} value={String(row.year)}>Year {row.year}</SelectItem>)}</SelectContent></Select>;
  const exitSelect = onExitYear && <Select value={String(a.exitYear)} onValueChange={v => onExitYear(Number(v))}><SelectTrigger className="h-7 w-24 text-sm"><SelectValue /></SelectTrigger><SelectContent>{r.rows.map(row => <SelectItem key={row.year} value={String(row.year)}>Year {row.year}</SelectItem>)}</SelectContent></Select>;
  return <section className="space-y-6" aria-label="Investment Summary">
    <section className="space-y-3"><div><h2 className="text-xl font-semibold">Investment Summary</h2><p className="text-sm text-muted-foreground">{name} · {location ?? 'Location not specified'} · Opening {a.openingYear}</p></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Kpi label="Total CAPEX" value={nokM(r.capex)} sub="NOK m incl. contingency" /><Kpi label="Initial equity" value={nokM(r.equity)} sub={`NOK m · ${pct(1 - a.debtShare)}`} /><Kpi label="Debt financing" value={nokM(r.debt)} sub={`NOK m · ${pct(a.debtShare)}`} /><Kpi label="Total modelled equity" value={nokM(r.equity)} sub="NOK m · initial funding only" /></div>
    </section>
    <section className="space-y-3"><div className="flex flex-wrap items-center gap-3"><h3 className="text-lg font-semibold">Year {perfYear} performance{perfRow ? ` · ${perfRow.calendarYear}` : ''}</h3>{perfSelect}</div>{perfRow && split ? <><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Kpi label="Passengers" value={int(perfRow.passengers)} /><Kpi label="Revenue" value={nokM(perfRow.revenue)} sub="NOK m, ex VAT" /><Kpi label="OPEX" value={nokM(perfRow.opex)} sub="NOK m" /><Kpi label="EBITDA" value={nokM(perfRow.ebitda)} sub={`NOK m · ${pct(perfRow.revenue ? perfRow.ebitda / perfRow.revenue : null)} margin`} /></div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5"><Kpi label={`Avg. ticket price Y${perfYear}`} value={nok(perfRow.ticketNetPrice)} sub="NOK / guest, net" /><Kpi label="Revenue / passenger" value={nok(perfRow.passengers > 0 ? perfRow.revenue / perfRow.passengers : null)} sub="NOK" /><Kpi label="EBITDA / passenger" value={nok(perfRow.passengers > 0 ? perfRow.ebitda / perfRow.passengers : null)} sub="NOK" /><Kpi label="Cable car EBITDA" value={nokM(split.cable.ebitda)} sub={`NOK m · revenue ${nokM(split.cable.revenue)}`} /><Kpi label="F&B EBITDA" value={nokM(split.fb.ebitda)} sub={`NOK m · revenue ${nokM(split.fb.revenue)}`} /></div></> : <p className="text-muted-foreground">This year is outside this scenario's forecast horizon.</p>}</section>
    <section className="space-y-3"><div className="flex flex-wrap items-center gap-3"><h3 className="text-lg font-semibold">Investment returns · exit Year {a.exitYear} ({exit?.calendarYear})</h3>{exitSelect}</div><div className="grid grid-cols-2 gap-3 lg:grid-cols-3"><Kpi label="Equity IRR" value={pct(r.equityIrr)} /><Kpi label="Equity MOIC" value={mult(r.equityMultiple)} /><Kpi label="Exit EBITDA" value={nokM(exit?.ebitda)} sub={`NOK m · multiple ${mult(a.exitMultiple)}`} /><Kpi label="Exit enterprise value" value={nokM(r.enterpriseValue)} sub="NOK m" /><Kpi label="Net debt at exit" value={nokM(exit ? exit.closingDebt - exit.retainedCash : null)} sub="NOK m · debt less retained cash" /><Kpi label="Exit equity value" value={nokM(r.exitEquityValue)} sub="NOK m after transaction costs" /></div>
      <p className="border-l-2 border-warning-foreground pl-3 text-sm text-warning-foreground">Additional equity injections are not supported by the existing model. Total modelled equity, IRR and MOIC include initial funding only; negative annual cash reduces retained cash and is not treated as new equity. Returns are not funding-complete where further injections would be required.</p>
      {r.rows.some(row => row.cashAfterDebt < 0) && <p className="text-sm text-destructive">This scenario has negative cash after debt service in at least one year. Review the funding requirement before relying on the displayed returns.</p>}
    </section>
    <BreakEvenPanel a={a} />
    <div className="grid gap-6 lg:grid-cols-2"><DevelopmentChart title="Revenue and EBITDA development" data={development} lines={['Revenue', 'EBITDA']} /><DevelopmentChart title="Annual passengers" data={development} lines={['Passengers']} passengers /><DevelopmentChart title="Equity cash flow" data={cashflows} lines={['Equity cash flow']} bar /></div>
    <EbitdaBridge a={a} r={r} />
  </section>;
}
