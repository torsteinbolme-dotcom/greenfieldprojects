import { useState } from 'react';
import type { Assumptions } from '@/financialEngine';
import type { ModelResult } from '@/lib/model';
import { economicsAtYear } from '@/lib/unit-economics';
import { int, nok } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function UnitEconomics({ a, r }: { a: Assumptions; r: ModelResult }) {
  const [year, setYear] = useState(Math.min(3, r.rows.length));
  const selected = Math.min(year, r.rows.length);
  const economics = economicsAtYear(a, r.rows, selected);
  return <section className="space-y-3" aria-label="Unit Economics">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-semibold">Unit Economics · Year {selected}</h3>
      <Select value={String(selected)} onValueChange={v => setYear(Number(v))}><SelectTrigger aria-label="Unit economics operating year" className="h-8 w-44"><SelectValue /></SelectTrigger><SelectContent>{r.rows.map(row => <SelectItem key={row.year} value={String(row.year)}>Year {row.year} · {row.calendarYear}</SelectItem>)}</SelectContent></Select>
    </div>
    {economics ? <><p className="text-xs text-muted-foreground">NOK per cable car passenger · excluding VAT · {int(economics.passengers)} passengers</p><div className="overflow-x-auto"><table className="fin-table"><thead><tr><th>Metric</th><th className="text-right">NOK / passenger</th><th className="text-right">Annual total (NOK)</th></tr></thead><tbody>{economics.items.map(item => <tr key={item.key} className={cn(item.total && 'font-semibold border-t', item.key === 'ebitda' && 'fin-key')}><td>{item.label}</td><td className={cn('num text-right', item.cost && 'text-destructive')}>{item.perPassenger === null ? 'N/A' : nok(item.perPassenger, 2)}</td><td className={cn('num text-right', item.cost && 'text-destructive')}>{nok(item.annual, 2)}</td></tr>)}</tbody></table></div></> : <p className="text-muted-foreground">Selected operating year unavailable.</p>}
  </section>;
}
