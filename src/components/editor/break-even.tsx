import { useMemo, useState } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Assumptions } from '@/financialEngine';
import { breakEven, DEFAULT_BREAK_EVEN_YEAR } from '@/lib/break-even';
import { int, pct } from '@/lib/format';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
export function BreakEvenPanel({ a }: { a: Assumptions }) {
  const [selected, setSelected] = useState(DEFAULT_BREAK_EVEN_YEAR);
  const year = Math.min(selected, a.years);
  const b = useMemo(() => breakEven(a, year), [a, year]);
  const chart = [{ name: 'Forecast', passengers: b.forecast, color: 'var(--chart-1)' }, { name: 'Operating', passengers: b.operating.passengers, color: 'var(--chart-2)' }, { name: 'Cash', passengers: b.cash.passengers, color: 'var(--chart-3)' }];
  return <section className="space-y-4 border-y py-5" aria-label="Passenger break-even">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-semibold">Passenger break-even</h3><Select value={String(year)} onValueChange={v => setSelected(Number(v))}><SelectTrigger className="w-40" aria-label="Break-even operating year"><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: a.years }, (_, i) => <SelectItem key={i} value={String(i + 1)}>Year {i + 1} ({a.openingYear + i})</SelectItem>)}</SelectContent></Select></div>
    <div className="grid gap-5 lg:grid-cols-2"><div className="overflow-x-auto"><table className="fin-table"><thead><tr><th>Year {year}</th><th className="text-right">Operating</th><th className="text-right">Cash</th></tr></thead><tbody>
      <tr><td>Break-even passengers</td><td className="num text-right">{int(b.operating.passengers)}</td><td className="num text-right">{int(b.cash.passengers)}</td></tr>
      <tr><td>Forecast passengers</td><td className="num text-right" colSpan={2}>{int(b.forecast)}</td></tr>
      <tr><td>Passenger headroom</td>{[b.operating, b.cash].map((t,i) => <td key={i} className="num text-right">{int(t.passengers == null ? null : b.forecast - t.passengers)}</td>)}</tr>
      <tr><td>Break-even / forecast</td>{[b.operating,b.cash].map((t,i) => <td key={i} className="num text-right">{pct(t.passengers == null || b.forecast <= 0 ? null : t.passengers / b.forecast)}</td>)}</tr>
    </tbody></table>{[b.operating,b.cash].map((t,i) => t.message && <p key={i} className="mt-2 text-sm text-warning-foreground">{i === 0 ? 'Operating' : 'Cash'}: {t.message}</p>)}</div>
    <div className="h-64 min-w-0"><ResponsiveContainer width="100%" height="100%"><BarChart data={chart}><XAxis dataKey="name" /><YAxis tickFormatter={v => int(Number(v))} width={80} /><Tooltip formatter={v => [int(Number(v)), 'Passengers']} /><Bar dataKey="passengers" isAnimationActive={false}>{chart.map(c => <Cell key={c.name} fill={c.color} />)}</Bar></BarChart></ResponsiveContainer></div></div>
    <p className="text-xs text-muted-foreground">Volume sensitivity scales the entire passenger forecast, preserving its growth pattern. Cash break-even uses the selected year's debt service and recalculated tax-loss history; it excludes depreciation and equity injections.</p>
    <p className="text-xs text-muted-foreground">Cable car OPEX remains fixed. Restaurant amounts follow their saved scaling settings; manual F&B and merchandise retain the model's existing behaviour. No extra operating payments or capacity limits are modelled.</p>
  </section>;
}
