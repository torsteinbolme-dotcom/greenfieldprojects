import { describe, expect, it, vi } from 'vitest';
import type { Assumptions } from '@/financialEngine';
import { projectMountain } from '@/exampleProject';
import { normalizeFromYear1, simulateSandbox } from '@/lib/sandbox';
import { safeCalculate } from '@/lib/model';

const writes = vi.fn(() => { throw Error('Sandbox must never write'); });
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: writes, rpc: writes } }));

const base = (): Assumptions => structuredClone(projectMountain);
const result = (a: Assumptions) => { const r = safeCalculate(a); if (!r.result) throw Error(r.error ?? 'missing result'); return r.result; };

describe('Year 1 normalization', () => {
  it('lands each project’s Year 1 on the target and keeps its own growth', () => {
    const a = base(), r = result(a);
    const t = normalizeFromYear1(r, { passengers: 200000, ticketPrice: 450 });
    if (!t) throw Error('expected a usable Year 1 baseline');
    const s = simulateSandbox(a, t);
    expect(s.result.rows[0].passengers).toBeCloseTo(200000, 0);
    expect(s.result.rows[0].ticketNetPrice).toBeCloseTo(450, 2);
    expect(s.result.rows[2].passengers).toBeGreaterThan(s.result.rows[0].passengers);
  });

  it('scales the Year 3 target by the Year 1 ratio, not by the Year 3 baseline', () => {
    const r = result(base());
    const y1 = r.rows[0], y3 = r.rows[2];
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
