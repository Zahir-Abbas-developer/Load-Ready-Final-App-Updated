/**
 * Rate limiting for the auth endpoints.
 *
 * Nothing guarded these before: sign-in could be tried without limit, and the
 * signup endpoint would send an email to any address as fast as it was asked.
 * ADR-16 also wants a CAPTCHA before a code is sent; that needs Turnstile keys,
 * so this closes the cheaper half of the same hole in the meantime.
 *
 * A fixed-window counter held in memory. That is honest about its limits: it
 * resets when the server restarts and each instance counts on its own, so it
 * slows down abuse rather than stopping a determined attacker. Moving it to the
 * database alongside the real auth migration is the fix.
 */

interface Window {
  count: number;
  /** Epoch ms when this window ends and the count resets. */
  resetAt: number;
}

const windows = new Map<string, Window>();

/** Stop the map growing without bound on a long-running server. */
const SWEEP_EVERY = 5 * 60 * 1000;
let lastSweep = Date.now();

function sweep(now: number) {
  if (now - lastSweep < SWEEP_EVERY) return;
  lastSweep = now;
  for (const [key, win] of windows) {
    if (win.resetAt <= now) windows.delete(key);
  }
}

export interface RateLimitRule {
  /** How many attempts are allowed inside the window. */
  limit: number;
  windowMs: number;
}

/**
 * Per-action budgets.
 *
 * Sign-in is the most attacked and the cheapest to retry, so it is tightest.
 * Anything that sends mail is tighter still, because the cost of abuse lands on
 * a stranger's inbox and on our sending reputation.
 */
export const AUTH_LIMITS: Record<string, RateLimitRule> = {
  login: { limit: 10, windowMs: 15 * 60 * 1000 },
  signup: { limit: 5, windowMs: 60 * 60 * 1000 },
  "resend-otp": { limit: 5, windowMs: 60 * 60 * 1000 },
  "verify-otp": { limit: 20, windowMs: 15 * 60 * 1000 },
  "request-password-reset": { limit: 5, windowMs: 60 * 60 * 1000 },
  "reset-password": { limit: 10, windowMs: 60 * 60 * 1000 },
};

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the caller may try again. Only meaningful when ok is false. */
  retryAfter: number;
}

export function checkRateLimit(key: string, rule: RateLimitRule): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const win = windows.get(key);
  if (!win || win.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { ok: true, retryAfter: 0 };
  }

  win.count += 1;
  if (win.count > rule.limit) {
    return { ok: false, retryAfter: Math.ceil((win.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}

/**
 * Is this caller currently over the limit? Does not spend anything.
 *
 * Sign-in uses this together with `recordFailure` so that **only wrong
 * passwords cost budget**. Counting every attempt meant a dispatch office of
 * fifteen people behind one connection shared ten sign-ins per quarter hour and
 * locked each other out on an ordinary Monday morning — while an attacker
 * guessing passwords was slowed by exactly the same amount either way. Charging
 * failures alone leaves the attacker throttled and the office alone.
 */
export function peekRateLimit(key: string, rule: RateLimitRule): RateLimitResult {
  const now = Date.now();
  const win = windows.get(key);
  if (!win || win.resetAt <= now) return { ok: true, retryAfter: 0 };
  if (win.count >= rule.limit) {
    return { ok: false, retryAfter: Math.ceil((win.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}

/** Spend one attempt against the key. */
export function recordFailure(key: string, rule: RateLimitRule) {
  const now = Date.now();
  sweep(now);
  const win = windows.get(key);
  if (!win || win.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + rule.windowMs });
    return;
  }
  win.count += 1;
}

/** Forget a key's failures. Called when the right password finally arrives. */
export function clearRateLimit(key: string) {
  windows.delete(key);
}

/**
 * Best-effort caller identity.
 *
 * Behind the Cloudflare tunnel and any real proxy the socket address is the
 * proxy's, so the forwarded headers are what identify the caller. They are
 * spoofable by anyone talking to the origin directly — which is why this is a
 * speed bump, not an access control.
 */
export function callerKey(request: Request, action: string): string {
  const forwarded =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  return `${action}:${forwarded}`;
}

/** Clears all counters. Tests only. */
export function resetRateLimits() {
  windows.clear();
  lastSweep = Date.now();
}
