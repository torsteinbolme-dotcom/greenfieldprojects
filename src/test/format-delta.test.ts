import { describe, expect, it } from "vitest";
import { deltaClass, signedNum, signedPct } from "@/lib/format";

describe("signed differences", () => {
  it("shows an explicit sign on a percentage difference", () => {
    expect(signedPct(0.1234)).toBe("+12,3%");
    expect(signedPct(-0.051)).toBe("-5,1%");
    expect(signedPct(0)).toBe("0,0%");
    expect(signedPct(null)).toBe("—");
  });

  it("shows an explicit sign on an amount difference", () => {
    expect(signedNum(1234)).toBe("+1 234");
    expect(signedNum(-1234)).toBe("-1 234");
    expect(signedNum(null)).toBe("—");
  });

  it("colours a difference green when positive and red when negative", () => {
    expect(deltaClass("+12,3%")).toBe("text-success");
    expect(deltaClass("-5,1%")).toBe("text-destructive");
    expect(deltaClass("+3,4 pp")).toBe("text-success");
    expect(deltaClass("-1 234")).toBe("text-destructive");
  });

  it("keeps zero, rounded-to-zero and missing values neutral", () => {
    expect(deltaClass("0,0%")).toBe("text-muted-foreground");
    expect(deltaClass("-0,0 pp")).toBe("text-muted-foreground");
    expect(deltaClass("—")).toBe("text-muted-foreground");
  });
});
