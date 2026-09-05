/**
 * Notifications inside the native shell.
 *
 * Web Push does not exist in either platform's WebView, so the shell uses
 * Apple's and Google's own channels — both through Firebase, which delivers to
 * Android directly and hands iPhone messages to Apple.
 *
 * **The message still carries nothing.** Firebase wakes the app and says only
 * that something happened; the app asks our own server what, and shows that.
 * Same reasoning as the web (`src/server/vapid.server.ts`): the notification's
 * text never passes through anybody else's servers, and what appears is always
 * current rather than a copy of what was true when it was sent.
 *
 * ---
 *
 * **The open question, stated here rather than buried.**
 *
 * That design is correct on Android and *unreliable on iOS*. Apple throttles
 * background pushes deliberately — a `content-available` message is delivered
 * at the system's discretion, not on demand — so an iPhone may simply not be
 * woken. The two ways out are to put the text in the payload (reliable, and
 * Apple sees every notification) or to add a Notification Service Extension
 * that fetches and rewrites it (keeps the privacy, and is a native target that
 * has to be written and tested on a Mac).
 *
 * I have not chosen for you, and I have not pretended the Android design
 * carries over. It is the first thing to settle when there is a device
 * (BACKLOG F-136).
 *
 * ---
 *
 * None of this file has run. There is no build on this machine and no Firebase
 * project to send from; the server half is tested, this half is not.
 */
import { nativePlatform } from "./native";

/** How long to wait for the platform to hand back a registration token. */
const TOKEN_TIMEOUT_MS = 15_000;

export type NativeRegistration =
  { ok: true; platform: "ios" | "android"; token: string } | { ok: false; reason: string };

/**
 * Asks for permission, registers, and returns the token.
 *
 * Must be called from something the person tapped. Both platforms refuse a
 * permission prompt that was not asked for, and both are right to.
 */
export async function registerForNativePush(): Promise<NativeRegistration> {
  const platform = nativePlatform();
  if (!platform) return { ok: false, reason: "This is not the LoadReady app." };

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== "granted") {
      return {
        ok: false,
        reason:
          "Notifications are turned off for LoadReady in your phone's settings. You will have to turn them back on there.",
      };
    }

    /*
     * The token arrives as an event rather than a return value, and on a bad
     * network it may not arrive at all — so this waits, but not forever. A
     * settings screen stuck on a spinner is worse than one that says it did
     * not work.
     */
    const token = await new Promise<string | null>((resolve) => {
      let settled = false;
      const finish = (value: string | null) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const timer = setTimeout(() => finish(null), TOKEN_TIMEOUT_MS);

      void PushNotifications.addListener("registration", (t) => {
        clearTimeout(timer);
        finish(t.value);
      });
      void PushNotifications.addListener("registrationError", () => {
        clearTimeout(timer);
        finish(null);
      });

      void PushNotifications.register();
    });

    if (!token) {
      return { ok: false, reason: "Your phone did not return a notification token. Try again." };
    }

    return { ok: true, platform, token };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

/** Stops this installation being notified. */
export async function unregisterNativePush(): Promise<void> {
  if (!nativePlatform()) return;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    await PushNotifications.unregister();
    await PushNotifications.removeAllListeners();
  } catch {
    // Signing out must never fail because of this. The server drops the token
    // the next time it tries to use it.
  }
}

/**
 * Shows the notification the empty push was telling us to fetch.
 *
 * A data-only message draws nothing by itself, which is the point — the system
 * has nothing to draw. So the app asks the server what is unread and shows it
 * locally.
 */
export async function showFetchedNotification(): Promise<void> {
  try {
    const res = await fetch("/api/notifications", { credentials: "include" });
    if (!res.ok) return;

    const data = (await res.json()) as {
      notifications?: Array<{ title: string; body: string; readAt: string | null }>;
    };
    const unread = (data.notifications ?? []).filter((n) => !n.readAt);
    if (unread.length === 0) return;

    const newest = unread[0];
    const more = unread.length - 1;

    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.schedule({
      notifications: [
        {
          // A fixed id, so several while the phone was in a pocket replace one
          // another rather than stacking into a column of banners.
          id: 1,
          title: newest.title,
          body: more > 0 ? `${newest.body}\n\nAnd ${more} more.` : newest.body,
        },
      ],
    });
  } catch {
    /* No signal at the moment it arrived. The in-app list still has it. */
  }
}

/**
 * Starts listening, once, for the pushes that arrive while the app is running.
 *
 * Returns a function that stops again, so a component can mount this without
 * leaving a listener behind.
 */
export async function listenForNativePush(): Promise<() => void> {
  if (!nativePlatform()) return () => undefined;

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const handle = await PushNotifications.addListener("pushNotificationReceived", () => {
      void showFetchedNotification();
    });
    return () => void handle.remove();
  } catch {
    return () => undefined;
  }
}
