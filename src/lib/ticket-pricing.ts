import type { Assumptions } from "@/financialEngine";

type Segment = Assumptions["segments"][number];

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

export function linkedTicketSegments(segments: Segment[]): Segment[] {
  const adult = segments.find((s) => isAdultRoundTrip(s.name));
  if (!adult) return segments;
  return segments.map((s) => {
    const ratio = ticketPriceRatio(s.name);
    if (ratio === null || isAdultRoundTrip(s.name)) return s;
    return { ...s, grossPrice: Number((adult.grossPrice * ratio).toPrecision(12)) };
  });
}

export function withLinkedTicketPrices(a: Assumptions): Assumptions {
  return { ...a, segments: linkedTicketSegments(a.segments) };
}