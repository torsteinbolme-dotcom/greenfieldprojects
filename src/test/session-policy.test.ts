import { describe, it, expect } from "vitest";
import { shouldSignOut, MAX_SESSION_MS } from "@/lib/session-policy";

const now = 1_000_000_000_000;
describe("session policy", () => {
  it("max session is 14 days", () => expect(MAX_SESSION_MS).toBe(14 * 86_400_000));
  it("remembered sign-in survives a browser restart within 14 days", () =>
    expect(shouldSignOut({ now, until: now + 1, remember: true, browserSessionActive: false })).toBe(false));
  it("remembered sign-in expires after 14 days", () =>
    expect(shouldSignOut({ now, until: now, remember: true, browserSessionActive: true })).toBe(true));
  it("without remember, closing the browser signs out", () =>
    expect(shouldSignOut({ now, until: now + 1, remember: false, browserSessionActive: false })).toBe(true));
  it("without remember, an open browser stays signed in", () =>
    expect(shouldSignOut({ now, until: now + 1, remember: false, browserSessionActive: true })).toBe(false));
});
