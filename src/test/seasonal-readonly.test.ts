import { describe, expect, it } from 'vitest';
import { projectMountain } from '@/exampleProject';
import { calculate } from '@/financialEngine';
import { initializeSeasonalPricing, seasonalFareReadOnly, seasonalGrossPrice } from '@/lib/seasonal-pricing';

describe('read-only seasonal fare rules', () => {
  it.each(['Annual pass adult', 'Cruise', 'Tour operators', 'MICE'])('%s cannot be edited in the seasonal table without rewriting its saved fare', name => {
    const segment = projectMountain.segments[0];
    if (!segment) throw Error('Missing adult fixture');
    const a = { ...projectMountain, segments: [{ ...segment, name, share: 1 }] };
    const pricing = initializeSeasonalPricing(a);
    pricing.prices[0] = { segmentName: name, low: 222, high: 444 };
    const saved = { ...a, seasonalPricing: pricing }, before = JSON.stringify(saved);
    expect(seasonalFareReadOnly(saved, 0)).toBe(true);
    expect(seasonalGrossPrice(saved, 0, 'low')).toBe(222);
    expect(seasonalGrossPrice(saved, 0, 'high')).toBe(444);
    calculate(saved);
    expect(JSON.stringify(saved)).toBe(before);
  });
  it('adult round-trip remains editable', () => {
    expect(seasonalFareReadOnly(projectMountain, 0)).toBe(false);
  });
});