import { describe, expect, it } from "vitest";
import { isRecoveryVisit } from "@/lib/recovery";

describe("password reset link detection", () => {
  it("accepts the newer query-string recovery link", () => {
    expect(isRecoveryVisit("?token_hash=abc123&type=recovery", "")).toBe(true);
  });

  it("accepts the older address-bar fragment recovery link", () => {
    expect(isRecoveryVisit("", "#access_token=abc&token_type=bearer&type=recovery")).toBe(true);
  });

  it("rejects a plain visit to the page", () => {
    expect(isRecoveryVisit("", "")).toBe(false);
  });

  it("rejects a different auth redirect such as email confirmation", () => {
    expect(isRecoveryVisit("?type=confirmation&token_hash=abc", "")).toBe(false);
  });

  it("rejects a page whose path merely mentions a reset", () => {
    expect(isRecoveryVisit("?redirect_to=%2Freset-password", "")).toBe(false);
  });
});
