import { calculate, type Assumptions, type YearResult } from '@/financialEngine';
import { passengersAt, sourceAdjust, withFbBenchmark, type AssumptionsWithFb } from './fb-benchmark';
import { withLinkedTicketPrices } from './ticket-pricing';
import { resolveAssumptions } from './advanced';

export const DEFAULT_BREAK_EVEN_YEAR = 3;
export type Threshold = { passengers: number | null; message: string | null };
export type BreakEven = { operating: Threshold; cash: Threshold; forecast: number; year: number };

/** Re-evaluate the full operating history at a trial annual volume, retaining the growth schedule and debt/tax rules. */
export function evaluatePassengers(input: Assumptions, year: number, annualPassengers: number): YearResult {
  if (!Number.isFinite(annualPassengers) || annualPassengers < 0) throw Error('Passenger volume must be finite and non-negative.');
  const a = resolveAssumptions(withLinkedTicketPrices(input)) as AssumptionsWithFb;
  const growth = passengersAt({ initialPassengers: 1, passengerGrowth: a.passengerGrowth }, year);
  if (!(growth > 0) || !Number.isFinite(growth)) throw Error('Passenger growth does not permit a positive volume in this year.');
  const initialPassengers = annualPassengers / growth;
  const sel = a.fbBenchmark;
  for (const kind of ['revenue', 'opex'] as const) {
    const source = sel?.[kind];
    if (source && sel && sourceAdjust(sel, source) && (!source.snapshot || !(Number(source.snapshot.cableCarPassengers) > 0))) {
      throw Error('Refresh the passenger-adjusted restaurant benchmark before calculating break-even.');
    }
  }
  const next = { ...a, initialPassengers };
  // Legacy/manual passenger-following inputs are absolute year-1 amounts: retain their per-passenger basis.
  if (a.fbFollowsPassengers && !sel?.revenue) {
    if (!(a.initialPassengers > 0)) throw Error('Set a positive year-1 passenger basis for passenger-linked manual F&B.');
    next.fbRevenueYear1 = a.fbRevenueYear1 * initialPassengers / a.initialPassengers;
  }
  if (a.fbFollowsPassengers && !sel?.opex && !a.opexGrowth?.fb?.length) {
    if (!(a.initialPassengers > 0)) throw Error('Set a positive year-1 passenger basis for passenger-linked manual F&B.');
    next.fbOpexYear1 = a.fbOpexYear1 * initialPassengers / a.initialPassengers;
  }
  const row = calculate(withFbBenchmark(next, [], [])).rows[year - 1];
  if (!row || !Number.isFinite(row.ebitda) || !Number.isFinite(row.cashAfterDebt)) throw Error('The selected year cannot be evaluated with these assumptions.');
  return row;
}

function solve(evaluate: (passengers: number) => number, forecast: number): Threshold {
  const f0 = evaluate(0);
  if (f0 >= 0) return { passengers: 0, message: 'Covered without ticket passengers under the stored non-passenger revenue assumptions.' };
  const probe = Math.max(1, forecast);
  const fp = evaluate(probe);
  if (fp <= f0) return { passengers: null, message: 'Increasing passenger volume does not improve coverage under the current revenue and cost assumptions.' };
  let hi = probe;
  while (evaluate(hi) < 0 && hi < 1e9) hi = Math.min(hi * 2, 1e9);
  if (evaluate(hi) < 0) return { passengers: null, message: 'No break-even found up to 1 000 000 000 annual passengers; review revenue and cost assumptions.' };
  let lo = 0;
  for (let i = 0; i < 70 && hi - lo > 0.001; i++) {
    const mid = (lo + hi) / 2;
    if (evaluate(mid) >= 0) hi = mid; else lo = mid;
  }
  const floor = Math.floor(hi);
  return { passengers: evaluate(floor) >= 0 ? floor : Math.ceil(hi), message: null };
}
export function breakEven(a: Assumptions, year = DEFAULT_BREAK_EVEN_YEAR): BreakEven {
  const forecast = passengersAt(a, year);
  try {
    if (!Number.isInteger(year) || year < 1 || year > a.years) throw Error('Operating year is outside the model horizon.');
    const cache = new Map<number, YearResult>();
    const row = (p: number) => {
      const saved = cache.get(p);
      if (saved) return saved;
      const value = evaluatePassengers(a, year, p); cache.set(p, value); return value;
    };
    return { year, forecast, operating: solve(p => row(p).ebitda, forecast), cash: solve(p => row(p).cashAfterDebt, forecast) };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to evaluate break-even.';
    return { year, forecast, operating: { passengers: null, message }, cash: { passengers: null, message } };
  }
}
