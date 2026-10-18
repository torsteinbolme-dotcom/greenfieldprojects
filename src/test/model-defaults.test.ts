import { describe, expect, it } from "vitest";
import { blankAssumptions, safeCalculate } from "@/lib/model";

describe("new-project defaults", () => {
  it("starts a fresh model at 15 years", () => {
    const a = blankAssumptions("Starter");
    expect(a.years).toBe(15);
    // the horizon must still be valid for the default exit year
    expect(a.exitYear).toBeLessThanOrEqual(a.years);
    expect(safeCalculate(a).error).toBeNull();
  });
});
