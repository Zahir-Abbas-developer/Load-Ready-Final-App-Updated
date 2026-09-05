/**
 * Push, on the browser's side of the line.
 *
 * Pure and client-safe: what counts as a real push endpoint, what to call a
 * device on a screen, and the one piece of encoding the subscribe call needs.
 * The signing and the sending are in `src/server/vapid.server.ts`.
 */

/**
 * The push services we will POST to, by host suffix.
 *
 * **This is a server-side request forgery guard, not a compatibility list.**
 *
 * A subscription endpoint arrives from the browser, is stored, and is later
 * fetched by our own server — which means an endpoint somebody could choose
 * freely is a way to make our server POST to an address of their choosing.
 * Inside a hosting network that reaches things a browser cannot: metadata
 * services, admin ports, other people's containers.
 *
 * So the endpoint has to belong to a push service somebody actually ships.
 * The cost is that a new browser with a new push host is refused until this
 * list grows, which is a line in a file and a deploy — and far cheaper than
 * the alternative.
 */
export const PUSH_SERVICE_HOSTS: string[] = [
  // Chrome, Edge and every Chromium browser on Android.
  "fcm.googleapis.com",
  "android.googleapis.com",
  // Firefox.
  "push.services.mozilla.com",
  // Safari, on macOS and on installed iOS web apps.
  "push.apple.com",
  // Windows, for Edge's own service.
  "notify.windows.com",
];

/**
 * Whether this is an endpoint we are willing to send to.
 *
 * HTTPS only, a known service, and no credentials smuggled into the URL.
 */
export function isPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 1000) return false;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;

  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

/**
 * What to call this browser in a list of "devices that can notify you".
 *
 * Read from the user agent, which is a guess — but "Chrome on Android" is the
 * difference between somebody recognising their own phone and staring at a
 * row of identical entries, and it is the only thing this is for. No
 * fingerprinting, no version numbers, and it is never used for anything but
 * this label.
 */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = (userAgent ?? "").toLowerCase();
  if (!ua) return "A browser";

  const browser = ua.includes("edg/")
    ? "Edge"
    : ua.includes("opr/") || ua.includes("opera")
      ? "Opera"
      : ua.includes("firefox")
        ? "Firefox"
        : ua.includes("chrome") || ua.includes("crios")
          ? "Chrome"
          : ua.includes("safari")
            ? "Safari"
            : "A browser";

  const platform = ua.includes("android")
    ? "Android"
    : /iphone|ipad|ipod/.test(ua)
      ? "iPhone or iPad"
      : ua.includes("mac os")
        ? "a Mac"
        : ua.includes("windows")
          ? "Windows"
          : ua.includes("linux")
            ? "Linux"
            : null;

  return platform ? `${browser} on ${platform}` : browser;
}

/**
 * The VAPID public key in the shape `pushManager.subscribe` wants.
 *
 * It takes raw bytes; the key travels as base64url. Browsers have never
 * accepted the string directly, so every Web Push implementation carries this
 * function.
 */
export function applicationServerKey(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  // Backed by a plain ArrayBuffer rather than the default: `subscribe` will
  // not take a view that might sit on a SharedArrayBuffer.
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ── what the screen has to say ─────────────────────────────────────────────

export type PushAvailability =
  | { available: true }
  /** Why not, in words a pilot can act on. */
  | { available: false; reason: string; fixable: boolean };

/**
 * Whether this browser can be asked at all, and what to say when it cannot.
 *
 * The iPhone case is the one worth getting right: Safari supports push, but
 * **only for a web app that has been added to the home screen**. A toggle that
 * just fails there teaches people the feature is broken; a line telling them
 * to install it first is the difference between a working notification and a
 * support email.
 */
export function pushAvailability(win: Window | undefined = undefined): PushAvailability {
  const w = win ?? (typeof window === "undefined" ? undefined : window);
  if (!w) return { available: false, reason: "Not available here.", fixable: false };

  const standalone =
    w.matchMedia?.("(display-mode: standalone)").matches === true ||
    (w.navigator as Navigator & { standalone?: boolean }).standalone === true;

  const isIos = /iphone|ipad|ipod/i.test(w.navigator.userAgent);

  if (!("serviceWorker" in w.navigator)) {
    return {
      available: false,
      reason: "This browser cannot show notifications when the app is closed.",
      fixable: false,
    };
  }

  if (!("PushManager" in w)) {
    if (isIos && !standalone) {
      return {
        available: false,
        reason:
          "On an iPhone, add LoadReady to your home screen first — Safari only allows notifications for an installed app. Tap Share, then Add to Home Screen.",
        fixable: true,
      };
    }
    return {
      available: false,
      reason: "This browser cannot show notifications when the app is closed.",
      fixable: false,
    };
  }

  if (typeof Notification !== "undefined" && Notification.permission === "denied") {
    return {
      available: false,
      reason:
        "Notifications are blocked for this site in your browser settings. You will have to turn them back on there.",
      fixable: true,
    };
  }

  return { available: true };
}
