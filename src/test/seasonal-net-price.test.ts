import { describe, expect, it } from 'vitest';
import { projectMountain } from '@/exampleProject';
import { initializeSeasonalPricing, seasonalNetPriceRows } from '@/lib/seasonal-pricing';

describe('seasonal net ticket price rows', () => {
  const a = { ...projectMountain, priceGrowth: [.1], segments: [
    { name: 'Adult', share: .75, grossPrice: 112, vatRate: .12, commission: .2, boardingsPerGuest: 2 },
    { name: 'Child', share: .25, grossPrice: 56, vatRate: .12, commission: .1, boardingsPerGuest: 2 },
  ] };
  const pricing = initializeSeasonalPricing(a);
  pricing.prices = [{ segmentName: 'Adult', low: 112, high: 224 }, { segmentName: 'Child', low: 56, high: 112 }];
  const saved = { ...a, seasonalPricing: pricing };
  it('low season excludes VAT and deducts commission using the passenger mix', () => {
    expect(seasonalNetPriceRows(saved, 1)[0]?.netPrice).toBeCloseTo(71.25, 10);
  });
  it('high season excludes VAT and deducts commission using the passenger mix', () => {
    expect(seasonalNetPriceRows(saved, 1)[1]?.netPrice).toBeCloseTo(142.5, 10);
  });
  it('both seasons use selected-year price escalation exactly once', () => {
    const rows = seasonalNetPriceRows(saved, 2);
    expect(rows[0]?.netPrice).toBeCloseTo(78.375, 10);
    expect(rows[1]?.netPrice).toBeCloseTo(156.75, 10);
  });
});