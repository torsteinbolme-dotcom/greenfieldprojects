import type { Assumptions } from '@/financialEngine';
import { safeCalculate } from '@/lib/model';
import { forecastOpex } from '@/lib/forecast-opex';
import { benchmarkAmount, type VolumeKind, type VolumeLine, type OpexMethod } from '@/lib/volume-methods';
import { Field, NumField } from './inputs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { nok } from '@/lib/format';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { initializeFromYear1, growthDriver } from '@/lib/volume-methods';

const names = { fb: 'F&B', merch: 'Merchandise', other: 'Other' };
const labels: Record<OpexMethod, string> = { legacy: 'Existing calculation', annual: 'Annual amount', benchmark: 'Restaurant benchmark', perPassenger: 'Per cable car passenger', revenuePercent: '% of corresponding revenue', fixedVariable: 'Fixed + variable per passenger' };
export function VolumeMethodsEditor({ a, set, ro }: { a: Assumptions; set: (p: Partial<Assumptions>) => void; ro: boolean }) {
  const row = safeCalculate(a).result?.rows[0];
  const costs = row ? forecastOpex(a, row) : null;
  return <div className="divide-y">{(['fb', 'merch', 'other'] as VolumeKind[]).map(kind => {
    const revenue = row ? kind === 'fb' ? row.fbRevenue : kind === 'merch' ? row.merchRevenue : row.otherRevenue ?? 0 : null;
    const opex = costs ? kind === 'fb' ? costs.fb : kind === 'merch' ? costs.merchandise : costs.other : null;
    const divide = (v: number | null) => v !== null && row && row.passengers > 0 ? nok(v / row.passengers, 2) : 'N/A';
    return <section key={kind} className="space-y-4 py-5 first:pt-0 last:pb-0" aria-label={`${names[kind]} calculation methods`}><h4 className="font-semibold">{names[kind]}</h4><div className="grid gap-5 md:grid-cols-2">{(['revenue', 'opex'] as const).map(side => {
      const line = a.volumeMethods?.[kind]?.[side] ?? {};
      const method = (line.method ?? 'legacy') as OpexMethod; // the advanced-only series method never reaches saved inputs
      const base = kind === 'fb' ? side === 'revenue' ? a.fbRevenueYear1 : a.fbOpexYear1 : kind === 'merch' ? side === 'revenue' ? a.merchRevenueYear1 : a.merchOpexYear1 : 0;
      const update = (patch: Partial<VolumeLine>) => set({ volumeMethods: { ...a.volumeMethods, [kind]: { ...a.volumeMethods?.[kind], [side]: { ...line, ...patch } } } });
      const methods: OpexMethod[] = side === 'revenue' ? ['legacy', 'annual', 'perPassenger'] : ['legacy', 'annual', 'perPassenger', 'revenuePercent', 'fixedVariable'];
      if (kind === 'fb') methods.splice(2, 0, 'benchmark');
      const amountField = (label: string, field: 'annualAmount' | 'perPassenger' | 'fixedAmount' | 'variablePerPassenger', fallback = 0) => <Field label={label}><NumField value={line[field] ?? fallback} disabled={ro} onChange={v => { if (v >= 0 && Number.isFinite(v)) update({ [field]: v }); }} /></Field>;
      return <div key={side} className="space-y-3"><Field label={`${names[kind]} ${side === 'revenue' ? 'revenue' : 'OPEX'} method`}><Select value={method} disabled={ro} onValueChange={v => update({ method: v as OpexMethod, ...(v === 'annual' && line.annualAmount === undefined ? { annualAmount: base } : {}) })}><SelectTrigger aria-label={`${names[kind]} ${side} method`} className="min-w-0"><SelectValue /></SelectTrigger><SelectContent>{methods.map(m => <SelectItem key={m} value={m}>{labels[m]}</SelectItem>)}</SelectContent></Select></Field>
        {method === 'annual' && amountField('Annual amount year 1 (NOK, ex VAT)', 'annualAmount', base)}
        {method === 'perPassenger' && amountField(`${side === 'revenue' ? 'Net revenue' : 'OPEX'} per passenger year 1 (NOK)`, 'perPassenger')}
        {method === 'revenuePercent' && <Field label="OPEX (% of corresponding revenue)"><NumField percent value={line.revenuePercent ?? 0} disabled={ro} onChange={v => { if (v >= 0 && Number.isFinite(v)) update({ revenuePercent: v }); }} /></Field>}
        {method === 'fixedVariable' && <div className="grid gap-3 sm:grid-cols-2">{amountField('Fixed annual OPEX year 1 (NOK)', 'fixedAmount')}{amountField('Variable OPEX / passenger year 1 (NOK)', 'variablePerPassenger')}</div>}
        {method === 'benchmark' && <p className="text-xs text-muted-foreground">{a.fbBenchmark?.[side] ? `Frozen benchmark basis: ${nok(benchmarkAmount(a, side))} NOK in Year 1` : 'No benchmark selected. Choose a restaurant below.'}</p>}
        <p className="text-xs text-muted-foreground">Growth: {growthDriver(kind, side, method)}</p>
        {!ro && method !== 'legacy' && method !== 'benchmark' && <Initialize method={method} amount={side === 'revenue' ? revenue : opex} revenue={revenue} passengers={row?.passengers ?? 0} apply={update} />}
        {method === 'legacy' && kind === 'other' && <p className="text-xs text-muted-foreground">No existing amount · 0 NOK</p>}
      </div>;
    })}</div><div className="grid grid-cols-2 gap-3 border-t pt-3 text-sm lg:grid-cols-4">{[['Annual revenue Y1 (NOK)', revenue === null ? 'N/A' : nok(revenue, 2)], ['Annual OPEX Y1 (NOK)', opex === null ? 'N/A' : nok(opex, 2)], ['Revenue / passenger Y1', divide(revenue)], ['OPEX / passenger Y1', divide(opex)], ['Contribution / passenger Y1', divide(revenue !== null && opex !== null ? revenue - opex : null)], ['Annual contribution Y1 (NOK)', revenue !== null && opex !== null ? nok(revenue - opex, 2) : 'N/A']].map(([label, value]) => <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="num font-semibold">{value}</p></div>)}</div></section>;
  })}</div>;
}

function Initialize({ method, amount, revenue, passengers, apply }: { method: OpexMethod; amount: number | null; revenue: number | null; passengers: number; apply: (p: Partial<VolumeLine>) => void }) {
  const [open, setOpen] = useState(false);
  const [fixedShare, setFixedShare] = useState<number | null>(null);
  if (!open) return <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>Initialize from current Year 1 value</Button>;
  const proposal = amount === null ? null : initializeFromYear1(method, { amount, revenue: revenue ?? 0, passengers, fixedShare });
  const text = !proposal ? (method === 'fixedVariable' && fixedShare === null ? 'Enter the fixed share of current Year 1 OPEX to convert.' : 'Cannot convert: Year 1 passengers or revenue is zero.') : Object.entries(proposal).map(([k, v]) => `${k === 'revenuePercent' ? 'Share of revenue' : k === 'annualAmount' ? 'Annual amount' : k === 'perPassenger' ? 'Per passenger' : k === 'fixedAmount' ? 'Fixed' : 'Variable / passenger'}: ${k === 'revenuePercent' ? `${nok((v as number) * 100, 2)} %` : `${nok(v as number, 2)} NOK`}`).join(' · ');
  return <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-xs">
    <p>Current Year 1 value: <span className="num font-semibold">{amount === null ? 'N/A' : `${nok(amount, 2)} NOK`}</span> · passengers <span className="num">{nok(passengers)}</span></p>
    {method === 'fixedVariable' && <Field label="Fixed share of Year 1 OPEX"><NumField percent value={fixedShare ?? 0} onChange={v => { if (v >= 0 && v <= 1) setFixedShare(v); }} /></Field>}
    <p>Proposed: <span className="num font-semibold">{text}</span></p>
    <div className="flex gap-2"><Button type="button" size="sm" disabled={!proposal} onClick={() => { if (proposal) apply(proposal); setOpen(false); }}>Apply</Button><Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>
  </div>;
}
