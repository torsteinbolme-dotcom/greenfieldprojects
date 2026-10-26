import { describe, expect, it } from "vitest";
import { formatNumber, formatNumberExact, formatNumberInput, formatNumberTyped, parseNumberInput, nok, nokM, pct, mult, int } from "@/lib/format";

describe("site number formatting", () => {
  it("uses spaces for thousands and commas for decimals", () => {
    expect(formatNumber(1000000, 2)).toBe("1 000 000,00");
    expect(formatNumber(1234567.89)).toBe("1 234 567,89");
    expect(formatNumber(-1234.5)).toBe("-1 234,5");
  });
  it("never displays more than two decimal places", () => {
    expect(formatNumber(12.34567, 5, 5)).toBe("12,35");
    expect(nok(1234.567, 5)).toBe("1 234,57");
    expect(nokM(1234567890, 5)).toBe("1 234,57");
    expect(pct(0.123456, 5)).toBe("12,35%");
    expect(mult(12.3456, 5)).toBe("12,35x");
    expect(int(1234567.8)).toBe("1 234 568");
  });
  it("parses grouped comma-decimal input without changing the stored scale", () => {
    expect(parseNumberInput("1 000 000,00")).toBe(1000000);
    expect(parseNumberInput("1 234,56")).toBe(1234.56);
    expect(parseNumberInput("12.5")).toBe(12.5);
    expect(formatNumberInput("1000000,00")).toBe("1 000 000,00");
    expect(formatNumberInput("1234,")).toBe("1 234,");
  });
  it("rejects more than two typed decimal places and invalid values", () => {
    expect(formatNumberInput("1,234")).toBeNull();
    expect(parseNumberInput("1,2,3")).toBeNull();
    expect(parseNumberInput("")).toBeNull();
    expect(parseNumberInput("-")).toBeNull();
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber(Infinity)).toBe("—");
  });
  it("displays years without a thousands separator", () => {
    expect(formatNumber(2029, 0, 2, false)).toBe("2029");
    expect(formatNumberInput("2029", false)).toBe("2029");
    expect(formatNumberInput("202", false)).toBe("202");
    expect(parseNumberInput("2029")).toBe(2029);
  });
});