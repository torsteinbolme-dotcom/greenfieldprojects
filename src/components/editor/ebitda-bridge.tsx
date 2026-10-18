import { useState } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Assumptions } from '@/financialEngine';
import type { ModelResult } from '@/lib/model';
import { bridgeValues } from '@/lib/ebitda-bridge';
import { nokM, pct } from '@/lib/format';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
export function EbitdaBridge({ a, r }: { a: Assumptions; r: ModelResult }) {
  const [year, setYear] = useState(3);
  const [filter, setFilter] = useState('total');
  const row = r.rows[Math.min(year, r.rows.length) - 1];
  if (!row) return null;
  const b = bridgeValues(a, row);
  const selected = filter === 'cable' ? b.cable : filter === 'fb' ? b.fb : b.total;
  const items = filter === 'total' ? [ ['Cable car ticket', b.cable], ['F&B', b.fb], ['Merchandise', b.merchandise] ] as const : [[filter === 'cable' ? 'Cable car ticket' : 'F&B', selected]] as const;
  const chart = [
    { name: 'Revenue', range: [0, selected.revenue / 1e6], color: 'var(--chart-1)' },
    { name: 'OPEX', range: [selected.ebitda / 1e6, selected.revenue / 1e6], color: 'var(--chart-2)' },
    { name: 'EBITDA', range: [Math.min(0, selected.ebitda / 1e6), Math.max(0, selected.ebitda / 1e6)], color: 'var(--chart-3)' },
  ];
  return <section className="space-y-4 border-y py-5" aria-label="Revenue OPEX EBITDA bridge">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-semibold">Revenue / OPEX / EBITDA bridge</h3>
      <div className="flex flex-wrap gap-3"><Tabs value={filter} onValueChange={setFilter}><TabsList><TabsTrigger value="total">Total</TabsTrigger><TabsTrigger value="cable">Cable Car</TabsTrigger><TabsTrigger value="fb">F&B</TabsTrigger></TabsList></Tabs>
      <Select value={String(row.year)} onValueChange={v => setYear(Number(v))}><SelectTrigger className="w-40" aria-label="Bridge operating year"><SelectValue /></SelectTrigger><SelectContent>{r.rows.map(y => <SelectItem key={y.year} value={String(y.year)}>Year {y.year} ({y.calendarYear})</SelectItem>)}</SelectContent></Select></div>
    </div>
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="h-72 min-w-0"><ResponsiveContainer width="100%" height="100%"><BarChart data={chart}><XAxis dataKey="name" /><YAxis tickFormatter={v => nokM(Number(v) * 1e6)} /><Tooltip formatter={(_, name, item) => [nokM((item.payload.name === 'OPEX' ? selected.opex : item.payload.name === 'EBITDA' ? selected.ebitda : selected.revenue)), 'NOK m']} /><Bar dataKey="range" isAnimationActive={false}>{chart.map(c => <Cell key={c.name} fill={c.color} />)}</Bar></BarChart></ResponsiveContainer></div>
      <div className="overflow-x-auto"><table className="fin-table"><thead><tr><th>Operating year {row.year} · NOK m</th><th className="text-right">Revenue</th><th className="text-right">OPEX</th><th className="text-right">EBITDA</th></tr></thead><tbody>
        {items.map(([name, item]) => <tr key={name}><td>{name}</td><td className="num text-right">{nokM(item.revenue)}</td><td className="num text-right">{nokM(item.opex)}</td><td className="num text-right">{nokM(item.ebitda)}</td></tr>)}
        {filter === 'total' && <tr><td>Unallocated / reconciliation</td><td className="num text-right">{nokM(b.unallocated.revenue)}</td><td className="num text-right">{nokM(b.unallocated.opex)}</td><td className="num text-right">{nokM(b.unallocated.revenue - b.unallocated.opex)}</td></tr>}
        <tr className="font-semibold"><td>{filter === 'total' ? 'Total' : 'Subtotal'}</td><td className="num text-right">{nokM(selected.revenue)}</td><td className="num text-right">{nokM(selected.opex)}</td><td className="num text-right">{nokM(selected.ebitda)}</td></tr>
        <tr><td>EBITDA margin</td><td colSpan={3} className="num text-right">{pct(selected.revenue ? selected.ebitda / selected.revenue : null)}</td></tr>
      </tbody></table><p className="mt-2 text-xs text-muted-foreground">Other revenue and OPEX are not separately available; any remainder is shown as unallocated.</p></div>
    </div>
  </section>;
}
