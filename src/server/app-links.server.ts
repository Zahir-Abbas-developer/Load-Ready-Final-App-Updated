/**
 * Serving the two app-association files, or honestly serving neither.
 *
 * Answered from the request handler rather than a route, for three reasons
 * that are all requirements rather than preferences:
 *
 * - **No redirect is allowed.** Apple fetches
 *   `/.well-known/apple-app-site-association` and follows nothing; Google is
 *   the same. A router that normalised the path or added a trailing slash
 *   would break both, and nothing would say so.
 * - **`apple-app-site-association` has no file extension**, which file-based
 *   routing has no comfortable way to express.
 * - They must never be behind a session.
 *
 * Never import this from client code.
 */
import {
  appSiteAssociation,
  assetLinks,
  isAppId,
  isTeamId,
  parseFingerprints,
} from "@/lib/mobile/app-links";

const ANDROID_PATH = "/.well-known/assetlinks.json";
const APPLE_PATH = "/.well-known/apple-app-site-association";

/**
 * Cached for a day, because these change when an app is re-signed and never
 * otherwise — and Android caches an `assetlinks.json` it has fetched, so a
 * wrong one is wrong for longer than it took to publish.
 */
const CACHE = "public, max-age=86400";

function json(body: unknown): Response {
  return new Response(JSON.stringify(body, null, 2), {
    headers: { "content-type": "application/json", "cache-control": CACHE },
  });
}

/**
 * Neither file is published until it is right.
 *
 * A 404 means "this domain has not claimed an app", which is the truth and
 * which both platforms handle by opening the browser — exactly what happens
 * today. A file containing a wrong or half-configured value is worse than no
 * file: Android caches it, iOS caches it harder, and links keep failing after
 * the mistake is fixed.
 */
function notPublished(): Response {
  return new Response("Not found.", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function androidResponse(): Response {
  const packageName = process.env.LOADREADY_ANDROID_PACKAGE?.trim() ?? "";
  const fingerprints = parseFingerprints(process.env.LOADREADY_ANDROID_FINGERPRINTS ?? "");

  if (!isAppId(packageName) || !fingerprints) return notPublished();
  return json(assetLinks({ packageName, fingerprints }));
}

function appleResponse(): Response {
  const teamId = process.env.LOADREADY_IOS_TEAM_ID?.trim().toUpperCase() ?? "";
  const bundleId = process.env.LOADREADY_IOS_BUNDLE_ID?.trim() ?? "";

  if (!isTeamId(teamId) || !isAppId(bundleId)) return notPublished();
  return json(appSiteAssociation({ teamId, bundleId }));
}

/**
 * Answers if this request is for one of the two files, and `null` otherwise so
 * the caller carries on to the app.
 */
export function appLinkResponse(request: Request): Response | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;

  const { pathname } = new URL(request.url);
  if (pathname === ANDROID_PATH) return androidResponse();
  if (pathname === APPLE_PATH) return appleResponse();
  return null;
}

/** What the store paperwork needs to know, without printing the values. */
export function appLinksConfigured(): { android: boolean; apple: boolean } {
  return {
    android: androidResponse().status === 200,
    apple: appleResponse().status === 200,
  };
}
