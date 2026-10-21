import { describe, expect, it, vi } from 'vitest';
import type { Assumptions } from '@/financialEngine';
import { projectMountain } from '@/exampleProject';
import { normalizeFromYear1, simulateSandbox } from '@/lib/sandbox';
import { safeCalculate } from '@/lib/model';

const writes = vi.fn(() => { throw Error('Sandbox must never write'); });
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: writes, rpc: writes } }));

const fixture = () => {
  const a = structuredClone(projectMountain) as Assumptions;
  const r = safeCalculate(a);
  if (!r.result) throw Error(r.error ?? 'missing result');
  const y1 = r.result.rows[0], y3 = r.result.rows[2];
  if (!y1 || !y3) throw Error('expected Year 1 and Year 3 rows');
  return { a, r: r.result, y1, y3 };
};
const simulated = (a: Assumptions, t: { passengers: number; ticketPrice: number }) => {
  const s = simulateSandbox(a, t);
  const y1 = s.result.rows[0], y3 = s.result.rows[2];
  if (!y1 || !y3) throw Error('expected simulated Year 1 and Year 3 rows');
  return { ...s, y1, y3 };
};

describe('Year 1 normalization', () => {
  it('lands each project’s Year 1 on the target and keeps its own growth', () => {
    const { a, r, y3 } = fixture();
    const t = normalizeFromYear1(r, { passengers: 200000, ticketPrice: 450 });
    if (!t) throw Error('expected a usable Year 1 baseline');
    const s = simulated(a, t);
    expect(s.y1.passengers).toBeCloseTo(200000, 0);
    expect(s.y1.ticketNetPrice).toBeCloseTo(450, 2);
    expect(s.y3.passengers).toBeGreaterThan(s.y1.passengers);
  });

  it('scales the Year 3 target by the Year 1 ratio, not by the Year 3 baseline', () => {
    const { r, y1, y3 } = fixture();
    const doubled = normalizeFromYear1(r, { passengers: y1.passengers * 2, ticketPrice: y1.ticketNetPrice });
    expect(doubled?.passengers).toBeCloseTo(y3.passengers * 2, 0);
    expect(doubled?.ticketPrice).toBeCloseTo(y3.ticketNetPrice, 6);
  });

  it('refuses a project with no usable Year 1 baseline', () => {
    const target = { passengers: 100000, ticketPrice: 400 };
    expect(normalizeFromYear1({ rows: [] } as never, target)).toBeNull();
    expect(normalizeFromYear1({ rows: [{ passengers: 0, ticketNetPrice: 500 }, { passengers: 0, ticketNetPrice: 500 }, { passengers: 10, ticketNetPrice: 500 }] } as never, target)).toBeNull();
    expect(normalizeFromYear1({ rows: [{ passengers: 100, ticketNetPrice: 0 }, { passengers: 100, ticketNetPrice: 0 }, { passengers: 100, ticketNetPrice: 0 }] } as never, target)).toBeNull();
  });
});
