// A reset link arrives either as ?token_hash=…&type=recovery (newer links) or as a
// #access_token=…&type=recovery fragment (older links). Only a visit that carries
// type=recovery may set a new password — a plain visit, or a different auth redirect such as
// an email confirmation, must not open the form.
export const RECOVERY_FLAG = "password_recovery";

export function isRecoveryVisit(search: string, hash: string): boolean {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  // "invite" links from Add user also land here so the new user can choose a password.
  const ok = (t: string | null) => t === "recovery" || t === "invite";
  return ok(query.get("type")) || ok(fragment.get("type"));
}
