/**
 * Time-based one-time passwords (RFC 6238), for administrator sign-in.
 *
 * Written against `node:crypto` rather than pulled from npm: the algorithm is
 * forty lines, and a dependency in the path of every administrator sign-in is a
 * dependency that can take the platform's most privileged account with it.
 *
 * Three details that are easy to get wrong and matter:
 *
 * - **A window either side.** Phone clocks drift. Accepting only the current
 *   thirty-second step rejects honest people; accepting a wide window hands an
 *   attacker more guesses. One step back and one forward is the usual answer.
 * - **Codes are single use.** Without that, a code read over someone's shoulder
 *   or captured on a phishing page works for another thirty seconds. The last
 *   accepted step is remembered per account and never accepted twice.
 * - **Constant-time comparison.** Comparing with `===` leaks how much of the
 *   code was right through timing, one digit at a time.
 *
 * Never import this from client code.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Thirty seconds is what every authenticator app assumes. */
export const STEP_SECONDS = 30;

/** One step either side: ±30s of clock drift tolerated. */
export const DRIFT_STEPS = 1;

export const CODE_DIGITS = 6;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Base32 (RFC 4648, no padding) — what authenticator apps expect. */
export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  // Authenticator apps show the secret in spaced groups, and people paste it
  // back that way. Lower case and padding are both common too.
  const clean = input.toUpperCase().replace(/[\s-]/g, "").replace(/=+$/, "");

  let bits = 0;
  let value = 0;
  const out: number[] = [];

  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error("Not a valid secret.");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A fresh secret. 20 bytes is the RFC's recommendation for SHA-1. */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Which thirty-second step a moment falls in. */
export function stepFor(now: number = Date.now()): number {
  return Math.floor(now / 1000 / STEP_SECONDS);
}

/** The six digits for one step. */
export function codeForStep(secret: string, step: number): string {
  const key = base32Decode(secret);

  // The counter is eight bytes, big-endian. BigInt rather than two 32-bit
  // halves because getting the high word wrong only shows up in 2038.
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));

  const digest = createHmac("sha1", key).update(counter).digest();

  // Dynamic truncation, RFC 4226 §5.3.
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 10 ** CODE_DIGITS).padStart(CODE_DIGITS, "0");
}

function sameCode(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export interface VerifyResult {
  ok: boolean;
  /** The step the code belonged to, so the caller can refuse it a second time. */
  step?: number;
  /**
   * The code was genuinely this account's, and has already been spent.
   *
   * Worth telling apart from a wrong code. Somebody who enrols and immediately
   * signs in hits this, and "that code is not right" sends them to check their
   * phone's clock for a code that was perfectly right. An attacker replaying a
   * captured code learns nothing from the distinction — they already knew it
   * was a real one.
   */
  reused?: boolean;
}

/**
 * Checks a code against the drift window.
 *
 * `lastUsedStep` is the last step this account successfully used. Anything at
 * or before it is refused however valid the arithmetic — that is what makes a
 * code single use.
 */
export function verifyCode(
  secret: string,
  code: string,
  options: { now?: number; lastUsedStep?: number | null } = {},
): VerifyResult {
  const candidate = code.replace(/\D/g, "");
  if (candidate.length !== CODE_DIGITS) return { ok: false };

  const current = stepFor(options.now ?? Date.now());
  const floor = options.lastUsedStep ?? null;

  let reused = false;

  for (let offset = -DRIFT_STEPS; offset <= DRIFT_STEPS; offset++) {
    const step = current + offset;

    let expected: string;
    try {
      expected = codeForStep(secret, step);
    } catch {
      return { ok: false };
    }
    if (!sameCode(expected, candidate)) continue;

    // Right code, already spent. Keep looking — a later step in the window
    // might still be unused and match.
    if (floor !== null && step <= floor) {
      reused = true;
      continue;
    }
    return { ok: true, step };
  }

  return reused ? { ok: false, reused: true } : { ok: false };
}

/**
 * The URI an authenticator app scans.
 *
 * The label carries the account so a phone with several LoadReady admins on it
 * shows which is which, and the issuer makes the entry say "LoadReady" rather
 * than a bare string of digits.
 */
export function otpauthUri(secret: string, account: string, issuer = "LoadReady"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(CODE_DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** The secret in spaced groups, for typing in by hand when a camera will not scan. */
export function formatSecretForDisplay(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}
