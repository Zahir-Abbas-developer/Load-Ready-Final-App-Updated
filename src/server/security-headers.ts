/**
 * Security headers, applied to every response the application produces.
 *
 * **Not to static assets.** Nitro serves `/assets/*` before the application
 * handler runs, so nothing here reaches them — measured in L3 (F-153). For a
 * script or a stylesheet the headers that do anything are `nosniff`; framing
 * and content-security policies apply to documents, and these are not
 * documents.
 *
 * Two content-security policies go out, and the split is deliberate:
 *
 * **Enforced**, on every response: `frame-ancestors 'none'`. Small enough to be
 * certain it breaks nothing, and it is the one directive that stops the app
 * being framed by a phishing page — clickjacking a dispatcher into approving
 * something is a real attack and this is a real defence.
 *
 * **Report-only**, the strict policy: script and style sources locked down.
 * It is not enforced yet because TanStack Start emits inline scripts for
 * hydration with no nonce, so enforcing would need every one of them
 * whitelisted by hash or the whole thing weakened with `unsafe-inline` — which
 * is a policy that permits exactly what it is supposed to prevent. Report-only
 * is what the plan asks for first, and it is honest about what it does: it
 * reports, it does not block.
 *
 * API responses are different. They are JSON, they never load anything, and
 * nothing about them is uncertain — so they get the strict policy **enforced**.
 */

/** Where map tiles come from. Leaflet + OpenStreetMap, no key (D2 is not wired). */
const TILE_HOSTS = "https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com";

/** The strict policy. Enforced for JSON, report-only for HTML. */
const STRICT_HTML_CSP = [
  "default-src 'self'",
  // 'unsafe-inline' is present only in the report-only policy so the reports
  // are about what actually needs fixing, not a flood of hydration scripts.
  "script-src 'self'",
  // Tailwind and the component library both emit inline style attributes.
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${TILE_HOSTS}`,
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const API_CSP = ["default-src 'none'", "frame-ancestors 'none'", "base-uri 'none'", "sandbox"].join(
  "; ",
);

/**
 * Headers every response carries.
 *
 * HSTS is only sent over HTTPS. Sending it from a plain-HTTP local server would
 * pin `localhost` to HTTPS in the developer's browser for a year, which is a
 * genuinely annoying thing to do to somebody.
 */
export function securityHeaders(options: { isApi: boolean; isSecure: boolean }): Headers {
  const headers = new Headers({
    // A file served with the wrong type must not be sniffed into something
    // executable. Matters most for the uploaded documents in /api/files.
    "x-content-type-options": "nosniff",
    // Belt and braces with frame-ancestors, for anything that predates CSP.
    "x-frame-options": "DENY",
    // A reset link or a document id in a URL must not leak to another origin.
    "referrer-policy": "strict-origin-when-cross-origin",
    // Nothing here needs a camera, a microphone or a payment handler. Geolocation
    // is kept because a pilot's live trip is the whole product.
    "permissions-policy": [
      "accelerometer=()",
      "camera=(self)",
      "geolocation=(self)",
      "gyroscope=()",
      "magnetometer=()",
      "microphone=()",
      "payment=()",
      "usb=()",
    ].join(", "),
    "cross-origin-opener-policy": "same-origin",
  });

  if (options.isApi) {
    headers.set("content-security-policy", API_CSP);
    // An authenticated JSON response has no business in a shared cache.
    headers.set("cache-control", "private, no-store");
  } else {
    headers.set("content-security-policy", "frame-ancestors 'none'");
    headers.set("content-security-policy-report-only", STRICT_HTML_CSP);
  }

  if (options.isSecure) {
    headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  }

  return headers;
}

/** True when the request reached us over HTTPS, directly or through a proxy. */
export function isSecureRequest(request: Request): boolean {
  if (request.headers.get("x-forwarded-proto") === "https") return true;
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Copies the headers onto a response without disturbing what the handler set.
 *
 * A handler that has already chosen a `cache-control` — the immutable asset
 * hashes, say — keeps it. These are a floor, not an override.
 */
export function withSecurityHeaders(response: Response, request: Request): Response {
  const url = new URL(request.url);
  const isApi = url.pathname.startsWith("/api/");
  const extra = securityHeaders({ isApi, isSecure: isSecureRequest(request) });

  const headers = new Headers(response.headers);
  for (const [name, value] of extra) {
    if (!headers.has(name)) headers.set(name, value);
  }

  // A streamed body (the trip event stream) must not be buffered by cloning it.
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
