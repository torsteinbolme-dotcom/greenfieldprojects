import { describe, expect, it } from "vitest";
import { projectMountain } from "@/exampleProject";
import { withLinkedTicketPrices } from "@/lib/ticket-pricing";
import { safeCalculate } from "@/lib/model";

const faresAt = (price: number) => withLinkedTicketPrices({
  ...projectMountain,
  segments: projectMountain.segments.map((s) => s.name === "Roundtrip adult" ? { ...s, grossPrice: price } : s),
});

describe("linked ticket pricing", () => {
  it.each([
    ["Roundtrip child", 50, 349.5],
    ["One-way adult", 60, 419.4],
    ["One-way child", 30, 209.7],
    ["Annual pass adult", 400, 2796],
    ["Cruise", 100, 699],
    ["Tour operators", 100, 699],
  ])("links %s to the adult round-trip fare", (name, at100, at699) => {
    expect(faresAt(100).segments.find((s) => s.name === name)?.grossPrice).toBe(at100);
    expect(faresAt(699).segments.find((s) => s.name === name)?.grossPrice).toBe(at699);
    expect(faresAt(0).segments.find((s) => s.name === name)?.grossPrice).toBe(0);
  });

  it("preserves commissions and the authoritative example inputs", () => {
    const linked = faresAt(699);
    expect(linked.segments.find((s) => s.name === "Cruise")?.commission).toBe(0.2);
    expect(linked.segments.find((s) => s.name === "Tour operators")?.commission).toBe(0.15);
    expect(projectMountain.segments.find((s) => s.name === "One-way adult")?.grossPrice).toBe(489.3);
  });

  it("uses linked prices in forecasts from existing stored inputs", () => {
    // At 100: 39 + 3.5 + 9 + 0.9 + 4 + 20 + 8.5 = 84.9 incl. VAT, after commission.
    const raw = { ...projectMountain, segments: projectMountain.segments.map((s) => s.name === "Roundtrip adult" ? { ...s, grossPrice: 100 } : s) };
    expect(safeCalculate(raw).result?.weightedTicket).toBeCloseTo(84.9 / 1.12, 8);
  });

  it("leaves custom fares and segments without an adult reference unchanged", () => {
    const custom = { name: "Group", share: 0, grossPrice: 125, vatRate: 0.12, commission: 0, boardingsPerGuest: 2 };
    expect(withLinkedTicketPrices({ ...projectMountain, segments: [...projectMountain.segments, custom] }).segments.at(-1)?.grossPrice).toBe(125);
    expect(withLinkedTicketPrices({ ...projectMountain, segments: [custom] }).segments).toEqual([custom]);
  });
});