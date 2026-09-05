import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { isNativeShell } from "@/lib/mobile/native";

/**
 * "Add LoadReady to your phone."
 *
 * A pilot who installs gets a home-screen icon, a full screen without the
 * browser chrome, and the offline page instead of the browser's error — which
 * on a job in a cutting is the difference between "the app is broken" and "I
 * have no signal".
 *
 * Two rules about when it appears:
 *
 * - **Only when the browser says it can be installed.** Chrome fires
 *   `beforeinstallprompt` when the manifest, the icons and the service worker
 *   are all in order; if it does not fire, offering the button would be
 *   offering something that cannot happen.
 * - **Once.** Dismissed is remembered, because a bar that comes back every
 *   session is one people learn to close without reading.
 *
 * iOS does not fire the event at all — Safari has no install API — so nothing
 * shows there. Telling an iPhone user to find "Add to Home Screen" in a share
 * sheet is what the native app is for (Phase K2).
 */

const DISMISSED = "loadready:install-dismissed";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    /*
     * Never inside the native app. Android would not fire the event there
     * anyway, but offering to install LoadReady from inside LoadReady is the
     * kind of detail that tells somebody the product was assembled rather
     * than made — so it is refused explicitly rather than left to luck.
     */
    if (isNativeShell()) return;

    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISSED) === "1";
    } catch {
      // A browser with storage blocked still gets the app; it just asks again.
    }
    if (dismissed) return;

    const onPrompt = (e: Event) => {
      // Chrome shows its own bar unless this is called, and its bar appears
      // over the app rather than inside it.
      e.preventDefault();
      setEvent(e as InstallEvent);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!event) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {
      /* nothing to do */
    }
    setEvent(null);
  };

  const install = async () => {
    await event.prompt();
    await event.userChoice;
    // Either way this bar has done its job.
    dismiss();
  };

  return (
    <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-2">
      <Download className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1 text-xs">
        Add LoadReady to your phone — it opens full screen and works better with no signal.
      </span>
      <button
        onClick={() => void install()}
        className="h-8 shrink-0 rounded-full bg-primary px-3 text-[11px] font-semibold text-primary-foreground"
      >
        Add
      </button>
      <button
        onClick={dismiss}
        aria-label="Not now"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
