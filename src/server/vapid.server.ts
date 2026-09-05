/**
 * Web Push, without Google, Apple or a vendor account.
 *
 * A push notification does not need Firebase. Every browser ships a push
 * service of its own — Chrome's, Mozilla's, Apple's — and the open protocol
 * for talking to them is VAPID (RFC 8292): sign a short-lived token with a
 * key pair you generated yourself, POST to the endpoint the browser gave you,
 * and the phone wakes up. No SDK, no project, no bill.
 *
 * **We send no payload.**
 *
 * A Web Push payload can be encrypted so the push service cannot read it, and
 * that would work. Sending nothing at all is better, and simpler:
 *
 * - The push service — Google's, for every Android phone — sees that somebody
 *   received *something*, and never what. Not the title, not the sender, not
 *   the load. There is no ciphertext for them to keep either.
 * - There is no message-encryption code here to get wrong. The only crypto in
 *   this file is a signature over a JSON token, which `node:crypto` does.
 * - What the phone shows is always current. The worker fetches the
 *   notification when it wakes, so one already read on a laptop is not shown
 *   again on the phone.
 *
 * The cost is one round trip on the device, and a generic "New activity" if
 * the phone has no signal at that moment. Worth it.
 *
 * Never import this from client code.
 */
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign } from "node:crypto";

/**
 * How long a signed token lasts.
 *
 * The spec allows 24 hours. Twelve is plenty for a request that is about to
 * be made, and a token that leaks is a token that expires this afternoon.
 */
const TOKEN_TTL_S = 12 * 3_600;

/**
 * How long a push service should hold a message for a phone that is off.
 *
 * Four hours. These are all "something happened on your job" — a phone that
 * has been off since this morning should be told to look, but a notification
 * from yesterday is an interruption about something already dealt with.
 */
export const PUSH_TTL_S = 4 * 3_600;

export interface VapidConfig {
  /** The public key, base64url, as the browser is given it. */
  publicKey: string;
  /** The private key, base64url. A secret: host environment only. */
  privateKey: string;
  /** `mailto:` or `https:` — who a push service should contact about us. */
  subject: string;
}

function readConfig(): VapidConfig | null {
  const publicKey = process.env.LOADREADY_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.LOADREADY_VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.LOADREADY_VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

/**
 * Whether this server can send a push at all.
 *
 * Read at call time rather than at import: the tests set the environment, and
 * a module that decided this once at startup could not be tested without a
 * process per case.
 */
export function pushConfigured(): boolean {
  return readConfig() !== null;
}

/** The key a browser needs in order to subscribe. Public by design. */
export function publicKey(): string | null {
  return readConfig()?.publicKey ?? null;
}

// ── keys ───────────────────────────────────────────────────────────────────

const b64url = (buf: Buffer | Uint8Array): string =>
  Buffer.from(buf).toString("base64url").replace(/=+$/, "");

const fromB64url = (value: string): Buffer => Buffer.from(value, "base64url");

/**
 * A fresh P-256 pair, in the shape the rest of the world writes them.
 *
 * The public key is the uncompressed point (65 bytes, `0x04 || x || y`) and
 * the private key is the 32-byte scalar, both base64url. That is what every
 * other Web Push implementation stores, so keys made here work anywhere and
 * keys made elsewhere work here.
 *
 * Used by `npm run vapid:keys`. Not called by the server.
 */
export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  const { publicKey: pub, privateKey: priv } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });

  const jwk = priv.export({ format: "jwk" }) as { x: string; y: string; d: string };
  const point = Buffer.concat([Buffer.from([0x04]), fromB64url(jwk.x), fromB64url(jwk.y)]);

  // Exported from the public half too, purely to prove the pair agrees before
  // anybody puts it in an environment variable.
  const check = (pub.export({ format: "jwk" }) as { x: string; y: string }).x;
  if (check !== jwk.x) throw new Error("Generated key pair does not agree with itself.");

  return { publicKey: b64url(point), privateKey: b64url(fromB64url(jwk.d)) };
}

/**
 * Rebuilds a signing key from the two strings in the environment.
 *
 * The private scalar alone is not enough for `node:crypto`; it wants the
 * public point with it. We have that — it is the key the browsers already
 * hold — so the two are reassembled into a JWK rather than stored twice in
 * some other format.
 */
function signingKey(config: VapidConfig) {
  const point = fromB64url(config.publicKey);
  if (point.length !== 65 || point[0] !== 0x04) {
    throw new Error("LOADREADY_VAPID_PUBLIC_KEY is not an uncompressed P-256 point.");
  }
  const d = fromB64url(config.privateKey);
  if (d.length !== 32) {
    throw new Error("LOADREADY_VAPID_PRIVATE_KEY is not a 32-byte P-256 scalar.");
  }

  return createPrivateKey({
    format: "jwk",
    key: {
      kty: "EC",
      crv: "P-256",
      x: b64url(point.subarray(1, 33)),
      y: b64url(point.subarray(33, 65)),
      d: b64url(d),
    },
  });
}

/** The public half, for verifying a signature in a test. */
export function verificationKey(config: VapidConfig) {
  return createPublicKey(signingKey(config));
}

// ── the token ──────────────────────────────────────────────────────────────

/**
 * The `aud` claim: the push service's origin, and nothing more of the URL.
 *
 * Signing the whole endpoint would tie the token to one subscription, which
 * sounds safer and is not what the spec says — a push service checks the
 * origin.
 */
function audienceOf(endpoint: string): string {
  return new URL(endpoint).origin;
}

/**
 * A signed VAPID token for one push service.
 *
 * Exported so a test can verify the signature rather than trust that a POST
 * which returned 201 was correctly signed — with no push service to try it
 * against, a wrong signature would otherwise be discovered in production.
 */
export function vapidToken(
  endpoint: string,
  config: VapidConfig,
  now = Date.now(),
): { token: string; publicKey: string } {
  const header = b64url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64url(
    Buffer.from(
      JSON.stringify({
        aud: audienceOf(endpoint),
        exp: Math.floor(now / 1000) + TOKEN_TTL_S,
        sub: config.subject,
      }),
    ),
  );

  const body = `${header}.${payload}`;
  /*
   * `ieee-p1363` is the raw r||s pair. Node's default is DER, which every
   * push service rejects — and rejects with a 401 that looks exactly like a
   * wrong key, which is a bad afternoon.
   */
  const signature = sign("sha256", Buffer.from(body), {
    key: signingKey(config),
    dsaEncoding: "ieee-p1363",
  });

  return { token: `${body}.${b64url(signature)}`, publicKey: config.publicKey };
}

// ── sending ────────────────────────────────────────────────────────────────

export type PushOutcome =
  | { ok: true }
  /** The subscription is dead: the browser was uninstalled, or it expired. */
  | { ok: false; gone: true; reason: string }
  | { ok: false; gone: false; reason: string };

/**
 * Wakes one device.
 *
 * An empty POST, signed. What the worker does when it arrives is in
 * `public/sw.js`.
 */
export async function sendWebPush(endpoint: string, now = Date.now()): Promise<PushOutcome> {
  const config = readConfig();
  if (!config) return { ok: false, gone: false, reason: "Push is not configured on this server." };

  let token: { token: string; publicKey: string };
  try {
    token = vapidToken(endpoint, config, now);
  } catch (err) {
    return { ok: false, gone: false, reason: (err as Error).message };
  }

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `vapid t=${token.token}, k=${token.publicKey}`,
        TTL: String(PUSH_TTL_S),
        // No body, and the push services want to be told so explicitly.
        "Content-Length": "0",
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    return { ok: false, gone: false, reason: `Could not reach the push service: ${String(err)}` };
  }

  if (res.status >= 200 && res.status < 300) return { ok: true };

  /*
   * 404 and 410 are the push service telling us this device is never coming
   * back — the browser was uninstalled, its data cleared, or the user
   * revoked permission. Keeping the row would mean retrying it five times an
   * hour forever, and holding a record of a device that no longer exists.
   */
  if (res.status === 404 || res.status === 410) {
    return { ok: false, gone: true, reason: "The device is no longer subscribed." };
  }

  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      gone: false,
      reason: "The push service rejected our key. Check LOADREADY_VAPID_* on the host.",
    };
  }

  return { ok: false, gone: false, reason: `The push service answered ${res.status}.` };
}
