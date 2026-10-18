import type { Assumptions } from "@/financialEngine";

export type PricedSegment = Assumptions["segments"][number] & { roundTripAdultRatio?: number };

/** Recognize standard fares while leaving custom segments independent. */
export function ticketPriceRatio(name: string): number | null {
  const key = name.toLowerCase().replace(/[^a-z]/g, "");
  switch (key) {
    case "roundtripadult": case "adultroundtrip": return 1;
    case "roundtripchild": case "childroundtrip": return 0.5;
    case "onewayadult": case "adultoneway": return 0.6;
    case "onewaychild": case "childoneway": return 0.3;
    case "annualpassadult": case "adultannualpass": return 4;
    case "cruise": case "touroperators": case "touroperator": return 1;
    default: return null;
  }
}

export function isAdultRoundTrip(name: string): boolean {
  const key = name.toLowerCase().replace(/[^a-z]/g, "");
  return key === "roundtripadult" || key === "adultroundtrip";
}

export function segmentTicketRatio(s: PricedSegment, adultPrice: number): number {
  if (isAdultRoundTrip(s.name)) return 1;
  return s.roundTripAdultRatio ?? ticketPriceRatio(s.name) ?? (adultPrice === 0 ? 0 : s.grossPrice / adultPrice);
}

export function linkedTicketSegments(segments: PricedSegment[]): PricedSegment[] {
  const adult = segments.find((s) => isAdultRoundTrip(s.name));
  if (!adult) return segments;
  return segments.map((s) => {
    if (isAdultRoundTrip(s.name)) return s;
    const ratio = segmentTicketRatio(s, adult.grossPrice);
    return { ...s, roundTripAdultRatio: ratio, grossPrice: Number((adult.grossPrice * ratio).toPrecision(12)) };
  });
}

export function withLinkedTicketPrices(a: Assumptions): Assumptions {
  return { ...a, segments: linkedTicketSegments(a.segments) };
}