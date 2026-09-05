/**
 * Turning push on and off, from the browser.
 *
 * Three things have to agree before a notification can arrive, and all three
 * can be changed behind the app's back — the browser's permission, the push
 * subscription itself, and our own record of it. So this reads all three
 * rather than remembering what it did last time: a person who cleared their
 * site data should see "off", not a switch that lies.
 */
import { useCallback, useEffect, useState } from "react";
import { applicationServerKey, pushAvailability } from "./push";
import { isNativeShell } from "@/lib/mobile/native";
import { registerForNativePush, unregisterNativePush } from "@/lib/mobile/native-push";

export type PushState =
  /** Still reading the browser and the server. */
  | { status: "loading" }
  /** This browser will never do it, or not until something changes. */
  | { status: "unavailable"; reason: string }
  /** The server has no VAPID keys. Nothing the person can do. */
  | { status: "not-configured" }
  | { status: "off" }
  | { status: "on"; label: string | null }
  /** A request is in flight. */
  | { status: "working" }
  | { status: "error"; message: string };

interface PushInfo {
  configured: boolean;
  /** Whether the server can reach the native app (Firebase). */
  nativeConfigured: boolean;
  publicKey: string | null;
  devices: Array<{ id: string; label: string; kind: "web" | "native"; since: string }>;
}

/**
 * Which row on the account is *this* installation.
 *
 * The web knows its own subscription by asking the browser. The app has no
 * equivalent: an account may have an iPhone and an Android on it, and the
 * server will not hand a token back for a client to quote at it, because a
 * token is a credential and a row id is not. So the app remembers its own id
 * from the moment it registered.
 */
const NATIVE_DEVICE_KEY = "loadready:native-device";

const rememberedDevice = (): string | null => {
  try {
    return localStorage.getItem(NATIVE_DEVICE_KEY);
  } catch {
    return null;
  }
};

const rememberDevice = (id: string | null) => {
  try {
    if (id) localStorage.setItem(NATIVE_DEVICE_KEY, id);
    else localStorage.removeItem(NATIVE_DEVICE_KEY);
  } catch {
    /* storage disabled still works; it simply registers again */
  }
};

async function readServer(): Promise<PushInfo> {
  const res = await fetch("/api/notifications", { credentials: "include" });
  if (!res.ok) throw new Error("Could not read your notification settings.");
  const data = (await res.json()) as { push?: PushInfo };
  return data.push ?? { configured: false, nativeConfigured: false, publicKey: null, devices: [] };
}

async function tellServer(
  action: string,
  payload: Record<string, unknown>,
): Promise<{ id?: string } | null> {
  const res = await fetch("/api/notifications", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action, ...payload }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Could not save that.");
  }
  const data = (await res.json().catch(() => ({}))) as { device?: { id?: string } };
  return data.device ?? null;
}

const registration = async (): Promise<ServiceWorkerRegistration | null> => {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.ready;
};

/**
 * Whether this browser is set up to be notified, and how to change it.
 *
 * `enable` must be called from something the person clicked. Browsers refuse
 * a permission prompt that was not asked for, and they are right to.
 */
export function usePushDevice() {
  const [state, setState] = useState<PushState>({ status: "loading" });
  const [publicKey, setPublicKey] = useState<string | null>(null);

  const read = useCallback(async () => {
    /*
     * Inside the app the browser's answer is the wrong one: a WebView has no
     * PushManager on either platform, so `pushAvailability` would report "this
     * browser cannot" about a device that certainly can. The shell has its own
     * channel and its own permission.
     */
    const native = isNativeShell();

    if (!native) {
      const availability = pushAvailability();
      if (!availability.available) {
        setState({ status: "unavailable", reason: availability.reason });
        return;
      }
    }

    try {
      const info = await readServer();
      setPublicKey(info.publicKey);

      if (native) {
        if (!info.nativeConfigured) {
          setState({ status: "not-configured" });
          return;
        }
        /*
         * This installation, not merely "some app on this account". Somebody
         * with it on for their iPhone should still see "off" on their Android,
         * because that is what is true of the thing in their hand.
         */
        const mine = rememberedDevice();
        const registered = info.devices.find((d) => d.kind === "native" && d.id === mine);
        if (!registered) rememberDevice(null);
        setState(registered ? { status: "on", label: registered.label } : { status: "off" });
        return;
      }

      if (!info.configured || !info.publicKey) {
        setState({ status: "not-configured" });
        return;
      }

      /*
       * The subscription on *this* browser, not the account's device list.
       * Somebody with push on their phone should still see "off" on their
       * laptop, because that is what is true of the thing in front of them.
       */
      const reg = await registration();
      const subscription = await reg?.pushManager.getSubscription();

      if (!subscription) {
        setState({ status: "off" });
        return;
      }

      const known = info.devices.length > 0;
      setState({ status: "on", label: known ? (info.devices[0]?.label ?? null) : null });
    } catch (err) {
      setState({ status: "error", message: (err as Error).message });
    }
  }, []);

  useEffect(() => {
    void read();
  }, [read]);

  const enable = useCallback(async () => {
    setState({ status: "working" });

    if (isNativeShell()) {
      const result = await registerForNativePush();
      if (!result.ok) {
        setState({ status: "unavailable", reason: result.reason });
        return;
      }
      try {
        const device = await tellServer("push-register-native", {
          platform: result.platform,
          token: result.token,
        });
        rememberDevice(device?.id ?? null);
        await read();
      } catch (err) {
        setState({ status: "error", message: (err as Error).message });
      }
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState({
          status: "unavailable",
          reason:
            permission === "denied"
              ? "Notifications are blocked for this site in your browser settings. You will have to turn them back on there."
              : "Notifications were not allowed.",
        });
        return;
      }

      const reg = await registration();
      if (!reg || !publicKey) throw new Error("This browser is not ready for notifications yet.");

      /*
       * `userVisibleOnly` is not optional in any browser that ships this: a
       * push must result in something the person can see. That is the deal,
       * and it is the right one — a silent wake-up is a tracking beacon.
       */
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(publicKey),
      });

      await tellServer("push-subscribe", { endpoint: subscription.endpoint });
      await read();
    } catch (err) {
      setState({ status: "error", message: (err as Error).message });
    }
  }, [publicKey, read]);

  const disable = useCallback(async () => {
    setState({ status: "working" });

    if (isNativeShell()) {
      try {
        const mine = rememberedDevice();
        await unregisterNativePush();
        if (mine) await tellServer("push-unsubscribe", { deviceId: mine });
        rememberDevice(null);
        setState({ status: "off" });
      } catch (err) {
        setState({ status: "error", message: (err as Error).message });
      }
      return;
    }

    try {
      const reg = await registration();
      const subscription = await reg?.pushManager.getSubscription();

      if (subscription) {
        // Our record goes first. If the browser's unsubscribe fails we would
        // otherwise be left sending to a device that has stopped listening.
        await tellServer("push-unsubscribe", { endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }

      setState({ status: "off" });
    } catch (err) {
      setState({ status: "error", message: (err as Error).message });
    }
  }, []);

  return { state, enable, disable, refresh: read };
}

/**
 * Stops push on this browser, without needing a component mounted.
 *
 * Called on sign-out. A shared laptop must not keep buzzing about a job
 * belonging to whoever used it last — and the worker would otherwise fetch
 * the *next* person's notifications with the next person's cookie.
 */
export async function unsubscribeThisBrowser(): Promise<void> {
  if (isNativeShell()) {
    const mine = rememberedDevice();
    await unregisterNativePush();
    if (mine) await tellServer("push-unsubscribe", { deviceId: mine }).catch(() => undefined);
    rememberDevice(null);
    return;
  }
  try {
    const reg = await registration();
    const subscription = await reg?.pushManager.getSubscription();
    if (!subscription) return;
    await tellServer("push-unsubscribe", { endpoint: subscription.endpoint }).catch(
      () => undefined,
    );
    await subscription.unsubscribe();
  } catch {
    // Signing out must never fail because of this.
  }
}
