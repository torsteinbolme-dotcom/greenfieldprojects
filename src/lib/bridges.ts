import type { Assumptions } from '@/financialEngine';
import { segmentNetPerGuest } from '@/lib/model';

export type WaterfallStep = { name: string; from: number; to: number; color: string; value: number };

/** Year-1 passengers and net revenue (ex VAT, after commission) per segment. */
export function segmentRows(a: Assumptions) {
  return a.segments.map(s => {
    const passengers = s.share * a.initialPassengers;
    return { name: s.name, passengers, netPerGuest: segmentNetPerGuest(s), netRevenue: passengers * segmentNetPerGuest(s) };
  });
}

/** CAPEX line totals in NOK. */
export function capexRows(a: Assumptions) {
  return a.capexItems.map(c => ({ name: c.name, value: c.quantity * c.unitCost }));
}

/**
 * Build floating waterfall steps: one per row (cumulative), optional middle
 * steps (e.g. contingency), then a full-height total bar.
 */
export function buildWaterfall(
  rows: { name: string; value: number }[],
  middle: { name: string; value: number }[] = [],
  totalName = 'Total',
): WaterfallStep[] {
  const steps: WaterfallStep[] = [];
  let cum = 0;
  let colorIdx = 0;
  const add = (name: string, value: number) => {
    const from = cum;
    cum += value;
    steps.push({ name, from, to: cum, color: `var(--chart-${(colorIdx++ % 5) + 1})`, value });
  };
  rows.forEach(r => add(r.name, r.value));
  middle.forEach(m => add(m.name, m.value));
  steps.push({ name: totalName, from: 0, to: cum, color: 'var(--primary)', value: cum });
  return steps;
}
