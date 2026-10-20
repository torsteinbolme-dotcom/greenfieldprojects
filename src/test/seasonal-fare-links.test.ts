import { describe, expect, it } from "vitest";
import { projectMountain } from "@/exampleProject";
import { initializeSeasonalPricing, seasonalGrossPrice, seasonalFareLinked, withLinkedSeasonalPrices, seasonalNetPrice } from "@/lib/seasonal-pricing";

const setup = () => {
  const names = ["Roundtrip adult", "Roundtrip child", "One-way adult", "One-way child", "Annual pass adult", "Cruise", "Tour operators", "MICE"];
  const ratios = [1, 0.5, 0.6, 0.3, 4, 1, 1, 0.6];
  const a = { ...projectMountain, segments: names.map((name, i) => ({ name, share: 0.125, grossPrice: 100 * (ratios[i] ?? 0), roundTripAdultRatio: ratios[i], vatRate: 0, commission: 0, boardingsPerGuest: 1 })) };
  const p = initializeSeasonalPricing(a); p.prices[0] = { segmentName: names[0] ?? "", low: 200, high: 400 };
  return { ...a, seasonalPricing: p };
};
describe("seasonal fare dependencies", () => {
  it.each([[1, 100, 200], [2, 120, 240], [3, 60, 120]])("derives linked fare %i for each season", (i, low, high) => {
    const a = setup(); expect(seasonalFareLinked(a, i)).toBe(true);
    expect(seasonalGrossPrice(a, i, "low")).toBe(low); expect(seasonalGrossPrice(a, i, "high")).toBe(high);
  });
  it.each([[4, 400], [5, 100], [6, 100], [7, 60]])("keeps selected fare %i independent", (i, fare) => {
    const a = setup(); expect(seasonalFareLinked(a, i)).toBe(false);
    expect(seasonalGrossPrice(a, i, "high")).toBe(fare);
    const price = a.seasonalPricing.prices[i]; if (!price) throw Error("Missing fare"); price.high = 777;
    expect(seasonalGrossPrice(a, i, "high")).toBe(777);
  });
  it("persists derived fares and uses them in net revenue without mutating saved snapshots", () => {
    const a = setup(); const p = withLinkedSeasonalPrices(a, a.seasonalPricing);
    expect(p.prices[1]?.high).toBe(200); expect(a.seasonalPricing.prices[1]?.high).toBe(50);
    expect(seasonalNetPrice(a, "high")).toBe(202.5);
  });
  it("respects an edited saved ratio", () => {
    const a = setup(); const child = a.segments[1]; if (!child) throw Error("Missing fare"); child.roundTripAdultRatio = 0.4;
    expect(seasonalGrossPrice(a, 1, "high")).toBe(160);
  });
});