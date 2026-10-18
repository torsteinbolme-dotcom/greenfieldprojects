import { describe, expect, it } from 'vitest';
import { blankAssumptions, withDefaultOpexGrowth, withDefaultProjectSegments } from '@/lib/model';
import { projectMountain } from '@/exampleProject';
import { calculate } from '@/financialEngine';
import { forecastOpex } from '@/lib/forecast-opex';

describe('Independent F&B OPEX defaults for every project', () => {
  it('keeps Heaven costs at their existing base with 20%, 15%, 3% growth, independent of benchmark revenue', () => {
    const a = { ...projectMountain, fbOpexYear1: 22639215.913480107,
      opexGrowth: { fb: [0.2, 0.15, 0.03] },
      fbBenchmark: { adjust: true, revenue: { assetId: 'eggen', year: 2025, adjust: true }, opex: null } };
    const rows = calculate(a).rows;
    const y2 = rows[1], y3 = rows[2];
    if (!y2 || !y3) throw new Error('Missing forecast');
    expect(forecastOpex(a, y2).fb).toBeCloseTo(27167059.09617613, 5);
    expect(forecastOpex(a, y3).fb).toBeCloseTo(31242117.960602548, 5);
  });
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