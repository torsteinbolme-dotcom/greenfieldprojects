import { describe, expect, it } from 'vitest';
import { blankAssumptions, withDefaultOpexGrowth, withDefaultProjectSegments } from '@/lib/model';
import { projectMountain } from '@/exampleProject';
import { calculate } from '@/financialEngine';
import { forecastOpex } from '@/lib/forecast-opex';

describe('Independent F&B OPEX defaults for every project', () => {
  it('gives both starter templates explicit F&B cost growth', () => {
    for (const a of [blankAssumptions('New'), withDefaultProjectSegments(projectMountain)]) {
      expect(a.opexGrowth?.fb).toEqual([0.025, 0.025, 0.025]);
    }
  });
  it('retains existing rates and other cost settings', () => {
    const a = { ...projectMountain, opexGrowth: { cable: [0.08], fb: [0.2, 0.15, 0.03] } };
    expect(withDefaultOpexGrowth(a)).toBe(a);
  });
  it('defaults existing missing lists without modifying old inputs or compounding revenue', () => {
    const old = { ...projectMountain, fbOpexYear1: 9000000, ancillaryGrowth: [0.2, 0.15], opexGrowth: { cable: [0.08] } };
    const a = withDefaultOpexGrowth(old);
    expect(old.opexGrowth).toEqual({ cable: [0.08] });
    expect(a.opexGrowth?.cable).toEqual([0.08]);
    const row = calculate(a).rows[2];
    if (!row) throw new Error('Missing year 3');
    expect(forecastOpex(a, row).fb).toBeCloseTo(9455625, 6);
  });
});