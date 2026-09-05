/**
 * The notifications nobody triggers.
 *
 * Everything else in the fan-out happens because somebody did something. These
 * two happen because a date arrived: a certificate is about to lapse, or a
 * trial is about to end. Both are the kind of thing a pilot finds out about at
 * the worst possible moment if we do not say anything.
 *
 * Idempotency is what makes a daily sweep safe: the delivery key includes the
 * subject, and the subject here carries the day count, so "7 days left" is sent
 * once and "3 days left" is a different message rather than a repeat.
 *
 * Never import this from client code.
 */
import { allPilotRecords, withLiveStatus } from "./profile-store.server";
import { subscriptionFor } from "./billing-store.server";
import { notify } from "./notifier.server";
import { documentsNeedingReminder } from "@/lib/profile/completion";

/** How much warning a trial gets. Matches the document reminders' shape. */
export const TRIAL_REMINDER_DAYS = [7, 3, 1, 0];

export async function runReminders(
  now = Date.now(),
): Promise<{ documents: number; trials: number }> {
  let documents = 0;
  let trials = 0;

  for (const raw of allPilotRecords()) {
    const record = withLiveStatus(raw, now);
    const userId = record.profile.userId;

    for (const due of documentsNeedingReminder(record, now)) {
      await notify({
        event: "document.expiring",
        userId,
        // The day count is part of the subject, so each reminder is its own
        // message rather than a duplicate of the last one.
        subject: `${due.document.id}:${due.daysLeft}`,
        vars: { documentLabel: due.label, days: due.daysLeft },
        target: { screen: "documents" },
        now,
      });
      documents += 1;
    }

    const subscription = subscriptionFor(userId);
    if (subscription.status === "trialing" && subscription.trialEnd) {
      const end = Date.parse(subscription.trialEnd);
      if (Number.isFinite(end)) {
        const daysLeft = Math.floor((end - now) / 86_400_000);
        if (TRIAL_REMINDER_DAYS.includes(daysLeft)) {
          await notify({
            event: "billing.trial_ending",
            userId,
            subject: `trial:${daysLeft}`,
            vars: { days: daysLeft },
            target: { screen: "billing" },
            now,
          });
          trials += 1;
        }
      }
    }
  }

  return { documents, trials };
}

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Runs the sweep daily.
 *
 * On a timer rather than a scheduler, like the deletion sweep, because there is
 * no cron here yet (BACKLOG F-01). A reminder arrives late rather than never if
 * the server restarts.
 */
export function startReminderSweep(intervalMs = 24 * 60 * 60 * 1000) {
  if (timer) return;
  const run = () => {
    void runReminders()
      .then(({ documents, trials }) => {
        if (documents || trials) {
          console.log(`[reminders] ${documents} document(s), ${trials} trial(s)`);
        }
      })
      .catch((err) => console.error("[reminders] sweep failed", err));
  };
  run();
  timer = setInterval(run, intervalMs);
  timer.unref?.();
}

/** Test seam. */
export function stopReminderSweep() {
  if (timer) clearInterval(timer);
  timer = null;
}
