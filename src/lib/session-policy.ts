// Sign-in persistence: "Remember me" keeps you signed in across browser restarts,
// otherwise the session ends when the browser closes. Either way, sign-in expires after 14 days.
export const MAX_SESSION_MS = 14 * 24 * 60 * 60 * 1000;
const UNTIL_KEY = "session_until";
const REMEMBER_KEY = "session_remember";
const ACTIVE_KEY = "session_active";

export function shouldSignOut(opts: { now: number; until: number | null; remember: boolean; browserSessionActive: boolean }): boolean {
  if (opts.until === null || opts.now >= opts.until) return true;
  return !opts.remember && !opts.browserSessionActive;
}

export function startSession(remember: boolean, now = Date.now()) {
  localStorage.setItem(UNTIL_KEY, String(now + MAX_SESSION_MS));
  localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
  sessionStorage.setItem(ACTIVE_KEY, "1");
}

/** Returns true when the stored sign-in has lapsed under the policy. */
export function sessionLapsed(now = Date.now()): boolean {
  let raw = localStorage.getItem(UNTIL_KEY);
  if (raw === null) {
    // Sign-ins from before this policy: start their 14-day window now.
    startSession(true, now);
    raw = localStorage.getItem(UNTIL_KEY);
  }
  return shouldSignOut({
    now,
    until: raw ? Number(raw) : null,
    remember: localStorage.getItem(REMEMBER_KEY) === "1",
    browserSessionActive: sessionStorage.getItem(ACTIVE_KEY) === "1",
  });
}

export function clearSessionPolicy() {
  localStorage.removeItem(UNTIL_KEY);
  localStorage.removeItem(REMEMBER_KEY);
  sessionStorage.removeItem(ACTIVE_KEY);
}
