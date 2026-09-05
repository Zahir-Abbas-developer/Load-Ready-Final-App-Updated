/**
 * Whether we are inside the native shell, and what that changes.
 *
 * The same web application serves three places now — a browser, an installed
 * web app, and a native shell — and a handful of things differ between them in
 * ways a user notices immediately if we get them wrong:
 *
 * - **Install prompts.** Offering "Add LoadReady to your home screen" inside
 *   the LoadReady app is the kind of detail that tells somebody the product
 *   was assembled rather than made.
 * - **Push.** Web Push does not exist in either platform's WebView. Inside the
 *   shell, notifications come through Apple's and Google's own channels, and
 *   the settings screen has to drive the right one.
 * - **Links.** A link that opens the app arrives as an event rather than as a
 *   navigation, and something has to catch it.
 *
 * Deliberately a plain read of the bridge with no other machinery: this is
 * asked on first paint, and a wrong answer for even a moment is a screen that
 * flickers between two versions of itself.
 */

export type NativePlatform = "ios" | "android";

interface CapacitorBridge {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

function bridge(win: Window | undefined): CapacitorBridge | null {
  const w = win ?? (typeof window === "undefined" ? undefined : window);
  if (!w) return null;
  const found = (w as Window & { Capacitor?: CapacitorBridge }).Capacitor;
  return found ?? null;
}

/**
 * True only inside the shell.
 *
 * Not "is this a phone" and not "is this installed" — both of those are also
 * true of a web app added to the home screen, which still has no native
 * anything. The distinction is the whole point.
 */
export function isNativeShell(win?: Window): boolean {
  const found = bridge(win);
  if (!found?.isNativePlatform) return false;
  try {
    return found.isNativePlatform() === true;
  } catch {
    // A bridge that throws is not a bridge we should be routing decisions
    // through. The web behaviour is the safe one: it works everywhere.
    return false;
  }
}

/** `null` on the web, including inside an installed web app. */
export function nativePlatform(win?: Window): NativePlatform | null {
  if (!isNativeShell(win)) return null;
  try {
    const platform = bridge(win)?.getPlatform?.();
    return platform === "ios" || platform === "android" ? platform : null;
  } catch {
    return null;
  }
}

/**
 * How this copy of LoadReady is being used, for the one or two screens that
 * genuinely need to say something different.
 *
 * `installed` means a web app added to the home screen: no native
 * capabilities, but no install prompt to offer either.
 */
export type Surface = "browser" | "installed" | "native";

export function surface(win?: Window): Surface {
  if (isNativeShell(win)) return "native";

  const w = win ?? (typeof window === "undefined" ? undefined : window);
  if (!w) return "browser";

  const standalone =
    w.matchMedia?.("(display-mode: standalone)").matches === true ||
    (w.navigator as Navigator & { standalone?: boolean }).standalone === true;

  return standalone ? "installed" : "browser";
}
