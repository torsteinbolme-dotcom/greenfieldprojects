import { describe, expect, it } from "vitest";
import { blankAssumptions, safeCalculate, withDefaultProjectSegments } from "@/lib/model";

import { projectMountain } from "@/exampleProject";
import { withLinkedTicketPrices, segmentTicketRatio } from "@/lib/ticket-pricing";

describe("new-project defaults", () => {
  it.each([blankAssumptions("Starter"), withDefaultProjectSegments(projectMountain)])("includes MICE at 60% of adult fare in each template", (a) => {
    const mice = a.segments.find((s) => s.name === "MICE");
    expect(mice && segmentTicketRatio(mice, 500)).toBe(0.6);
    expect(mice?.share).toBe(0);
    const updated = withLinkedTicketPrices({ ...a, segments: a.segments.map((s) => /adult.*roundtrip|roundtrip.*adult/i.test(s.name) ? { ...s, grossPrice: 1000 } : s) });
    expect(updated.segments.find((s) => s.name === "MICE")?.grossPrice).toBe(600);
  });
  it("preserves existing MICE inputs without duplicates", () => {
    const a = blankAssumptions("Starter");
    const custom = { ...a, segments: a.segments.map((s) => s.name === "MICE" ? { ...s, roundTripAdultRatio: 0.7, share: 0.1 } : s) };
    expect(withDefaultProjectSegments(custom)).toEqual(custom);
  });
  it("starts a fresh model at 15 years", () => {
    const a = blankAssumptions("Starter");
    expect(a.years).toBe(15);
    // the horizon must still be valid for the default exit year
    expect(a.exitYear).toBeLessThanOrEqual(a.years);
    expect(safeCalculate(a).error).toBeNull();
  });
});
