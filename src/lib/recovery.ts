// A reset link arrives either as ?token_hash=…&type=recovery (newer links) or as a
// #access_token=…&type=recovery fragment (older links). Only a visit that carries
// type=recovery may set a new password — a plain visit, or a different auth redirect such as
// an email confirmation, must not open the form.
export const RECOVERY_FLAG = "password_recovery";

export function isRecoveryVisit(search: string, hash: string): boolean {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  return query.get("type") === "recovery" || fragment.get("type") === "recovery";
}
