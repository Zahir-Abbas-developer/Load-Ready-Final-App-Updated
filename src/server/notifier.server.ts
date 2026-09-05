/**
 * The fan-out: one event in, a notification and whatever channels are allowed
 * out.
 *
 * Every place in the app that does something worth telling somebody about
 * calls `notify` and nothing else. It decides — from the catalogue and the
 * person's own preferences — what actually goes where, and it never throws:
 * a hiring must not fail because an email queue did.
 *
 * Never import this from client code.
 */
import { CATALOG, type NotificationEvent, type Vars } from "@/lib/notifications/catalog";
import { whenToSend } from "@/lib/notifications/delivery";
import { preferencesFor } from "./preferences-store.server";
import { userById } from "./auth-store.server";
import { mailerConfigured, sendNotificationEmail } from "./mailer.server";
import { pushConfigured, sendWebPush } from "./vapid.server";
import { deviceKey, devicesFor, dropEndpoint, markSeen } from "./push-store.server";
import { nativePushConfigured, sendNativePush } from "./fcm.server";
import {
  dueDeliveries,
  markFailed,
  markSent,
  queueDelivery,
  recordNotification,
  recordSkipped,
  type Notification,
} from "./notification-store.server";

/**
 * Why a channel cannot carry this, if it cannot.
 *
 * Two different silences that must not look the same in the delivery log: a
 * server with no provider configured, and a person who has simply not turned
 * push on for any of their browsers. The first is ours to fix.
 */
function channelUnavailable(
  channel: string,
  userId: string,
): { reason: string; short: string } | null {
  if (channel === "email" && !mailerConfigured()) {
    return {
      reason: "Email delivery is not configured on this server.",
      short: "no email provider",
    };
  }
  if (channel === "push") {
    /*
     * Either sender is enough. A server with only the web keys still notifies
     * every browser; one with only Firebase still notifies the app. Refusing
     * unless both were configured would mean the first half of the setup did
     * nothing.
     */
    if (!pushConfigured() && !nativePushConfigured()) {
      return {
        reason: "Push is not configured on this server.",
        short: "no push keys",
      };
    }
    if (devicesFor(userId).length === 0) {
      return {
        reason: "No browser on this account has notifications turned on.",
        short: "no registered device",
      };
    }
  }
  return null;
}

export interface NotifyInput {
  event: NotificationEvent;
  /** Who is being told. */
  userId: string;
  /** What it is about: a load id, a document id, an account id. */
  subject: string;
  vars?: Vars;
  target?: Notification["target"];
  now?: number;
}

/**
 * Tells one person about one thing.
 *
 * Returns what happened rather than nothing, because the tests and the report
 * both need to be able to say "email was skipped, and here is why" instead of
 * guessing from an empty log.
 */
export async function notify(input: NotifyInput): Promise<{
  notification: Notification | null;
  channels: Array<{ channel: string; outcome: string }>;
}> {
  const outcomes: Array<{ channel: string; outcome: string }> = [];

  try {
    const definition = CATALOG[input.event];
    if (!definition) {
      console.error(`[notify] unknown event "${input.event}"`);
      return { notification: null, channels: outcomes };
    }

    const user = await userById(input.userId);
    if (!user) return { notification: null, channels: outcomes };

    const preferences = preferencesFor(input.userId);
    const vars = input.vars ?? {};
    const title = definition.title(vars);
    const body = definition.body(vars);
    const now = input.now ?? Date.now();

    /*
     * The in-app record is written whatever the preferences say.
     *
     * It is a list in the app, not an interruption. Muting it would mean a
     * pilot could switch off the record of having been hired — and then have
     * no way to find out they were.
     */
    const notification = recordNotification({
      userId: input.userId,
      event: input.event,
      subject: input.subject,
      title,
      body,
      target: input.target,
      now,
    });
    outcomes.push({ channel: "in_app", outcome: "recorded" });

    // `documentExpiry` has no switch. Everything else does.
    const category = definition.category;
    const muted =
      category !== "documentExpiry" &&
      preferences.notify[category as keyof typeof preferences.notify] === false;

    for (const channel of definition.channels) {
      if (muted) {
        recordSkipped({
          ...input,
          channel,
          subject: input.subject,
          reason: "The recipient turned this category off.",
        });
        outcomes.push({ channel, outcome: "skipped: muted" });
        continue;
      }

      /*
       * Recorded as skipped rather than queued.
       *
       * Queueing would put every message through six attempts and into the
       * dead-letter list, burying the one real failure under a thousand
       * copies of "no API key".
       */
      const unavailable = channelUnavailable(channel, input.userId);
      if (unavailable) {
        recordSkipped({ ...input, channel, subject: input.subject, reason: unavailable.reason });
        outcomes.push({ channel, outcome: `skipped: ${unavailable.short}` });
        continue;
      }

      const decision = whenToSend({
        channel,
        urgent: definition.urgent,
        quiet: preferences.quietHours,
        timeZone: preferences.timeZone,
        now,
      });

      const { duplicate } = queueDelivery({
        userId: input.userId,
        event: input.event,
        subject: input.subject,
        channel,
        /*
         * Push has no single address — it goes to every browser the person
         * registered, and that list changes between queueing and sending. The
         * row records the account; the sender reads the devices at send time.
         */
        to: channel === "push" ? "registered devices" : user.email,
        subjectLine: title,
        body,
        holdUntil: decision.holdUntil,
        now,
      });

      outcomes.push({
        channel,
        outcome: duplicate
          ? "already queued"
          : decision.holdUntil
            ? "held until quiet hours end"
            : "queued",
      });
    }

    return { notification, channels: outcomes };
  } catch (err) {
    // A notification must never be the reason a hiring fails.
    console.error("[notify] could not send", input.event, err);
    return { notification: null, channels: outcomes };
  }
}

/** Tells several people about the same thing. Failures are per-person. */
export async function notifyEach(
  userIds: string[],
  input: Omit<NotifyInput, "userId">,
): Promise<number> {
  let sent = 0;
  for (const userId of new Set(userIds)) {
    const result = await notify({ ...input, userId });
    if (result.notification) sent += 1;
  }
  return sent;
}

// ── the queue worker ───────────────────────────────────────────────────────

/**
 * Drains whatever is due.
 *
 * Sequential rather than parallel: this is a handful of emails a minute, and
 * a provider rate-limit turned into a burst is a self-inflicted outage.
 */
export async function drainDeliveries(now = Date.now()): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (const delivery of dueDeliveries(now)) {
    if (delivery.channel === "email") {
      const result = await sendNotificationEmail(delivery.to, delivery.subjectLine, delivery.body);
      if (result.delivered) {
        markSent(delivery.id, now);
        sent += 1;
      } else {
        markFailed(delivery.id, result.reason ?? "Delivery failed.", now);
        failed += 1;
      }
      continue;
    }

    if (delivery.channel === "push") {
      const result = await pushToDevices(delivery.userId, now);
      if (result.woken > 0) {
        markSent(delivery.id, now);
        sent += 1;
      } else {
        markFailed(delivery.id, result.reason, now);
        failed += 1;
      }
      continue;
    }

    markFailed(delivery.id, `No sender for channel "${delivery.channel}".`, now);
    failed += 1;
  }

  return { sent, failed };
}

/**
 * Wakes every browser this person registered.
 *
 * Nothing about the notification is sent — see `vapid.server.ts` and
 * `fcm.server.ts`. One unreachable phone must not stop the others, and a
 * device either service says is gone is removed rather than retried for the
 * rest of its life.
 */
async function pushToDevices(
  userId: string,
  now: number,
): Promise<{ woken: number; reason: string }> {
  const devices = devicesFor(userId);
  if (devices.length === 0) {
    return { woken: 0, reason: "No browser on this account has notifications turned on." };
  }

  let woken = 0;
  let lastReason = "The push service could not be reached.";

  for (const device of devices) {
    const key = deviceKey(device);
    // A browser goes through its own push service; an installed app goes
    // through Firebase. Neither knows about the other.
    const outcome =
      device.kind === "native"
        ? await sendNativePush(device.token, now)
        : await sendWebPush(device.endpoint, now);

    if (outcome.ok) {
      markSeen(key, now);
      woken += 1;
      continue;
    }
    lastReason = outcome.reason;
    if (outcome.gone) dropEndpoint(key);
  }

  return { woken, reason: lastReason };
}

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Starts the drain loop.
 *
 * On a timer rather than a job queue, for the same reason the deletion sweep
 * is: there is no cron here yet (BACKLOG F-01). If the server is down for an
 * hour, a message goes late rather than not at all.
 */
export function startNotificationWorker(intervalMs = 30_000) {
  if (timer) return;
  const run = () => {
    void drainDeliveries().then(({ sent, failed }) => {
      if (sent || failed) console.log(`[notify] sent ${sent}, failed ${failed}`);
    });
  };
  run();
  timer = setInterval(run, intervalMs);
  // Never the reason the process refuses to exit.
  timer.unref?.();
}

/** Test seam. */
export function stopNotificationWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}
