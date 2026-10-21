import { describe, expect, it } from "vitest";
import { delta, metrics, value } from "@/components/comparison/sandbox";
import { MOIC_YEAR } from "@/lib/portfolio";
import type { SandboxCase } from "@/lib/sandbox";

const exit = { exitMultiple: 10, exitTransactionCostRate: 0 };

/** Eight-year project: 100 equity in, Year 3 revenue/EBITDA, Year 8 sale worth 160. */
const caseAt = (overrides: Partial<SandboxCase> = {}) => ({
  assumptions: exit,
  result: {
    equity: 100,
    // Deliberately wrong exit-year outputs: the Y8 rows must ignore these.
    equityMultiple: 99,
    equityIrr: 0.99,
    rows: Array.from({ length: MOIC_YEAR }, (_, i) => ({
      year: i + 1,
      ebitda: i === 7 ? 20 : i === 2 ? 100 : 0,
      revenue: i === 2 ? 250 : 0,
      passengers: i === 2 ? 300 : 0,
      closingDebt: i === 7 ? 50 : 0,
      retainedCash: i === 7 ? 10 : 0,
      equityInjection: 0,
      distribution: 0,
    })),
  },
} as unknown as SandboxCase);

const get = (label: string, c: SandboxCase) => metrics.find((m) => m.label === label)?.get(c);

describe("sandbox metric list", () => {
  it("shows only MOIC Y8, IRR Y8, EBITDA Y3 and Revenue Y3", () => {
    expect(metrics.map((m) => m.label)).toEqual(["MOIC Y8", "IRR Y8", "EBITDA Y3 (NOK)", "Revenue Y3 (NOK)"]);
  });

  it("reads Year 8 returns, not the scenario's own exit-year MOIC or IRR", () => {
    const c = caseAt();
    expect(get("MOIC Y8", c)).toBeCloseTo(1.6, 10); // (20 × 10 − 50 + 10) / 100
    expect(get("IRR Y8", c)).toBeCloseTo(Math.pow(1.6, 1 / 8) - 1, 8);
  });

  it("reads Year 3 EBITDA and revenue", () => {
    const c = caseAt();
    expect(get("EBITDA Y3 (NOK)", c)).toBe(100);
    expect(get("Revenue Y3 (NOK)", c)).toBe(250);
  });

  it("has no Year 8 answer when the forecast stops earlier", () => {
    const short = { assumptions: exit, result: { equity: 100, rows: [{ year: 1, ebitda: 5, revenue: 6 }] } } as unknown as SandboxCase;
    expect(get("MOIC Y8", short)).toBeNull();
    expect(get("IRR Y8", short)).toBeNull();
  });
});

describe("sandbox summary formatting", () => {
  it("renders EBITDA and Revenue Y3 as whole NOK", () => {
    expect(value(149965081.73, "money")).toBe("149 965 082");
    expect(value(227249117.2, "money")).toBe("227 249 117");
  });

  it("shows the difference in whole NOK with the relative change kept", () => {
    const d = delta(149965081.73, 158556553.66, "money");
    expect(d.text).toBe("+8 591 472");
    expect(d.relative).toBe("+5,73%");
  });

  it("keeps decimals for returns and the average ticket price", () => {
    expect(value(1.6, "mult")).toBe("1,60x");
    expect(value(0.0832, "pct")).toBe("8,32%");
    expect(value(504.9)).toBe("504,9");
  });
});
