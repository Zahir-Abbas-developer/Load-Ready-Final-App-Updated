/**
 * Push into the native app, through Firebase.
 *
 * One provider for both platforms: Firebase Cloud Messaging delivers to
 * Android directly and to iPhones by handing the message to Apple, which is
 * why `docs/MOBILE_BUILD.md` asks for the APNs key to be uploaded to Firebase
 * rather than used here. One integration, one place for it to break.
 *
 * **The same "carry nothing" rule as Web Push.** The message wakes the app and
 * says only that something happened; the app then asks our own server what.
 * Firebase — and, for iPhones, Apple after it — sees a notification occurred
 * and never what it said. It is also what keeps a notification current: one
 * already read on a laptop is not shown again on the phone.
 *
 * Unlike Web Push this genuinely needs an account. A Firebase project issues a
 * service account, and its private key signs the token that gets an access
 * token. Until that exists, every send is refused with a reason and the
 * delivery log says so rather than pretending.
 *
 * **Not verified against Firebase.** There is no project to send to. The token
 * this builds is signed and its signature is tested; the request it is used
 * for is not, and the first real send is the test that matters.
 *
 * Never import this from client code.
 */
import { createPrivateKey, sign } from "node:crypto";

/** Google's token endpoint, and the one scope FCM needs. */
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

/** An access token lasts an hour; ask again a minute early. */
const TOKEN_TTL_S = 3_600;
const REFRESH_MARGIN_MS = 60_000;

/**
 * How long Firebase should hold a message for a phone that is off.
 *
 * Four hours, matching Web Push. These are all "something happened on your
 * job" — worth telling a phone that has been off since this morning, not worth
 * interrupting somebody about yesterday.
 */
export const NATIVE_TTL_S = 4 * 3_600;

export interface FcmConfig {
  projectId: string;
  clientEmail: string;
  /** The service account's PEM private key. A secret: host environment only. */
  privateKey: string;
}

/**
 * Reads the service account from the environment.
 *
 * The whole JSON that Firebase downloads, in one variable, because that is
 * what the console gives you — asking somebody to split it into three is how
 * a newline gets lost out of the middle of a private key.
 */
function readConfig(): FcmConfig | null {
  const raw = process.env.LOADREADY_FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };
    const projectId = parsed.project_id?.trim();
    const clientEmail = parsed.client_email?.trim();
    // Environment variables cannot hold real newlines on most hosts, so the
    // key arrives with them escaped. Every Firebase guide hits this.
    const privateKey = parsed.private_key?.replace(/\\n/g, "\n").trim();

    if (!projectId || !clientEmail || !privateKey) return null;
    return { projectId, clientEmail, privateKey };
  } catch {
    console.error(
      "[fcm] LOADREADY_FIREBASE_SERVICE_ACCOUNT is not valid JSON. Native push is off.",
    );
    return null;
  }
}

/** Whether this server can reach the native app at all. */
export function nativePushConfigured(): boolean {
  return readConfig() !== null;
}

// ── the assertion that buys an access token ────────────────────────────────

const b64url = (value: Buffer | string): string =>
  Buffer.from(value).toString("base64url").replace(/=+$/, "");

/**
 * The signed JWT Google exchanges for an access token.
 *
 * Exported so a test can verify the signature rather than trust that a request
 * which returned 200 was correctly signed — with no Firebase project to try it
 * against, a wrong signature would otherwise be found in production.
 */
export function serviceAccountAssertion(config: FcmConfig, now = Date.now()): string {
  const issued = Math.floor(now / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: config.clientEmail,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: issued,
      exp: issued + TOKEN_TTL_S,
    }),
  );

  const body = `${header}.${claims}`;
  // RS256 here rather than the ES256 of VAPID: this is Google's choice, not
  // ours, and the key they issue is RSA.
  const signature = sign("sha256", Buffer.from(body), createPrivateKey(config.privateKey));

  return `${body}.${b64url(signature)}`;
}

let cached: { token: string; expiresAt: number } | null = null;

/** Test seam, and what a key rotation would need. */
export function clearAccessToken() {
  cached = null;
}

async function accessToken(config: FcmConfig, now: number): Promise<string | null> {
  if (cached && cached.expiresAt - REFRESH_MARGIN_MS > now) return cached.token;

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: serviceAccountAssertion(config, now),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.error(`[fcm] could not get an access token: ${res.status}`);
      return null;
    }

    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;

    cached = {
      token: data.access_token,
      expiresAt: now + (data.expires_in ?? TOKEN_TTL_S) * 1000,
    };
    return cached.token;
  } catch (err) {
    console.error("[fcm] could not reach Google's token endpoint", err);
    return null;
  }
}

// ── the message ────────────────────────────────────────────────────────────

/**
 * The body of the send, carrying no content.
 *
 * A `data`-only message on Android, so the app is woken and decides what to
 * show rather than the system drawing a notification from a title we would
 * have had to put in the payload. On iOS the same effect needs
 * `content-available`, which is Apple's flag for "wake the app quietly".
 */
export function pushMessage(token: string) {
  return {
    message: {
      token,
      data: { kind: "loadready.check" },
      android: { priority: "HIGH", ttl: `${NATIVE_TTL_S}s` },
      apns: {
        headers: {
          "apns-priority": "5",
          "apns-push-type": "background",
          "apns-expiration": "0",
        },
        payload: { aps: { "content-available": 1 } },
      },
    },
  };
}

export type NativePushOutcome =
  | { ok: true }
  /** The installation is gone: uninstalled, or the token was replaced. */
  | { ok: false; gone: true; reason: string }
  | { ok: false; gone: false; reason: string };

/** Wakes one installation of the app. */
export async function sendNativePush(token: string, now = Date.now()): Promise<NativePushOutcome> {
  const config = readConfig();
  if (!config) {
    return { ok: false, gone: false, reason: "Native push is not configured on this server." };
  }

  const bearer = await accessToken(config, now);
  if (!bearer) {
    return { ok: false, gone: false, reason: "Could not authenticate with Firebase." };
  }

  let res: Response;
  try {
    res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/messages:send`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${bearer}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(pushMessage(token)),
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch (err) {
    return { ok: false, gone: false, reason: `Could not reach Firebase: ${String(err)}` };
  }

  if (res.ok) return { ok: true };

  /*
   * 404 is Firebase saying this registration token belongs to nothing — the
   * app was uninstalled, or its data cleared. 403 usually means the token
   * belongs to a different Firebase project, which is equally never going to
   * start working. Keeping either would mean retrying it for the rest of its
   * life and holding a record of an installation that does not exist.
   */
  if (res.status === 404) {
    return { ok: false, gone: true, reason: "The app is no longer installed." };
  }

  if (res.status === 401) {
    clearAccessToken();
    return { ok: false, gone: false, reason: "Firebase rejected our credentials." };
  }

  return { ok: false, gone: false, reason: `Firebase answered ${res.status}.` };
}
