/**
 * The two files that make a link open the app instead of the browser.
 *
 * Both stores require the *website* to vouch for the app, not the other way
 * round — which is why this lives here rather than in a native project. A
 * verification email, a password reset or a load link opens LoadReady itself
 * only if the domain publishes one of these and it matches the installed app
 * exactly.
 *
 * - **Android App Links** — `/.well-known/assetlinks.json`
 * - **iOS Universal Links** — `/.well-known/apple-app-site-association`
 *
 * Everything in them is public by design: a package name, a team identifier
 * and the fingerprint of a signing certificate. None of it is a secret, and
 * all of it is wrong until the store accounts exist — which is why nothing is
 * published until it is configured.
 */

/**
 * Apple's team identifier. Ten characters, upper-case letters and digits.
 *
 * Found in the Apple Developer account's membership page. It prefixes the app
 * identifier as `TEAMID.com.example.app`.
 */
const TEAM_ID = /^[A-Z0-9]{10}$/;

/**
 * A reverse-DNS application identifier, e.g. `ai.loadready.app`.
 *
 * At least one dot, because a single word is a mistake rather than an
 * identifier, and neither store accepts one.
 */
const APP_ID = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_-]+)+$/;

/** A signing certificate's SHA-256 fingerprint: 32 hex pairs, colon separated. */
const FINGERPRINT = /^([0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2}$/;

export const isTeamId = (value: string): boolean => TEAM_ID.test(value);
export const isAppId = (value: string): boolean => APP_ID.test(value);
export const isFingerprint = (value: string): boolean => FINGERPRINT.test(value);

/**
 * Reads the comma-separated fingerprint list, and refuses the whole thing if
 * any entry is malformed.
 *
 * All or nothing on purpose. A file published with one good fingerprint and
 * one typo verifies for some installations and not others, which is the
 * hardest kind of bug to be told about — "it works on my phone".
 *
 * **Expect two of these, not one.** With Play App Signing, Google re-signs the
 * app with its own key, so the fingerprint of the certificate you upload with
 * is not the one on the installed app. Both belong here. Listing only the
 * upload key is the single most common reason Android App Links silently fall
 * back to opening the browser.
 */
export function parseFingerprints(raw: string): string[] | null {
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 0) return null;
  if (!parts.every(isFingerprint)) return null;

  // Upper case: Google's documentation and the Play console both print them
  // that way, and a diff between two spellings of the same value wastes an
  // afternoon.
  return parts.map((p) => p.toUpperCase());
}

// ── the documents ──────────────────────────────────────────────────────────

export interface AndroidApp {
  packageName: string;
  fingerprints: string[];
}

/**
 * `assetlinks.json` — the domain saying "this app may handle my links".
 *
 * `handle_all_urls` is the whole point: without the delegation Android opens
 * the browser, and with it every LoadReady link on this domain opens the app.
 */
export function assetLinks(app: AndroidApp): unknown[] {
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: app.packageName,
        sha256_cert_fingerprints: app.fingerprints,
      },
    },
  ];
}

export interface AppleApp {
  teamId: string;
  bundleId: string;
}

/**
 * `apple-app-site-association` — the same statement, for iOS.
 *
 * Two things about this file are easy to get wrong and both break it silently:
 * it has **no file extension**, and it must be served as JSON from HTTPS with
 * no redirect. Serving it from the request handler rather than the router is
 * what guarantees the second.
 *
 * `/api/*` is excluded. A universal link is a thing a person tapped; an API
 * call is not, and handing one to the app would mean a link in an email could
 * make the app perform a request rather than show a screen.
 */
export function appSiteAssociation(app: AppleApp): unknown {
  return {
    applinks: {
      details: [
        {
          appIDs: [`${app.teamId}.${app.bundleId}`],
          components: [
            { "/": "/api/*", exclude: true, comment: "Requests, not screens." },
            { "/": "/*", comment: "Everything a person can be sent a link to." },
          ],
        },
      ],
    },
  };
}
