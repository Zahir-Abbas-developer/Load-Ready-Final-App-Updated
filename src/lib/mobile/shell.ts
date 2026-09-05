/**
 * The two things the shell has to do while it is running.
 *
 * Catching links that were routed to the app, and showing the notifications
 * that an empty push told it to fetch. Both are no-ops on the web, so the
 * component that mounts this does not need to know which it is in.
 *
 * Not verified — there is no build on this machine. See `native-push.ts`.
 */
import { useEffect } from "react";
import { isNativeShell } from "./native";
import { listenForNativePush } from "./native-push";

/**
 * Whether a link handed to us by the operating system is one we will follow.
 *
 * **Only our own origin.** A universal link arrives from outside the app —
 * anything on the phone can ask the system to open a URL — and following an
 * arbitrary one would turn the shell into a browser that renders somebody
 * else's page inside a window holding our session. Exported so this is a
 * decision with a test rather than a line inside a listener.
 */
export function linkTarget(incoming: string, appOrigin: string): string | null {
  let url: URL;
  let origin: URL;
  try {
    url = new URL(incoming);
    origin = new URL(appOrigin);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;
  if (url.host !== origin.host) return null;

  // The path only. Reassembled rather than passed through, so nothing in the
  // original — a username, a port, a different scheme — survives the check.
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Runs the native listeners for as long as the app is open.
 *
 * Deliberately one hook rather than several: they are all "things the shell
 * does", they all have to be torn down, and a component that mounts three of
 * them is a component that will one day mount two.
 */
export function useNativeShell(): void {
  useEffect(() => {
    if (!isNativeShell()) return;

    let stopPush: (() => void) | undefined;
    let stopLinks: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      stopPush = await listenForNativePush();
      if (cancelled) stopPush();

      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("appUrlOpen", ({ url }) => {
          const target = linkTarget(url, window.location.origin);
          // Silently ignored rather than shown as an error: somebody tapped a
          // link, and a dialog about origins is not an answer they can use.
          if (target) window.location.assign(target);
        });
        stopLinks = () => void handle.remove();
        if (cancelled) stopLinks();
      } catch {
        /* the plugin is absent on the web, which is the normal case */
      }
    })();

    return () => {
      cancelled = true;
      stopPush?.();
      stopLinks?.();
    };
  }, []);
}
