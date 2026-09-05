/**
 * Everything LoadReady will tell somebody about, and how.
 *
 * The catalogue is data, like the authorization matrix and the state machine.
 * Adding an event means adding a row — and the row has to say which channels
 * may carry it and whether it is urgent enough to wake somebody, so nobody can
 * add a notification without answering those two questions.
 *
 * Two rules run through it:
 *
 * - **In-app always arrives.** It is a list in the app, not an interruption;
 *   muting it would mean a pilot could switch off the record of being hired.
 *   Preferences control the channels that reach *out* — email and push.
 * - **Urgency is about the person's day, not ours.** A load starting in the
 *   morning is worth a message at ten at night. Product news is not, and
 *   "somebody bid on your load" is not either.
 */

export type NotificationEvent =
  | "load.matching"
  | "load.cancelled"
  | "offer.received"
  | "position.filled"
  | "offer.accepted"
  | "offer.declined"
  | "assignment.status"
  | "assignment.completed"
  | "assignment.cancelled"
  | "assignment.no_show"
  | "message.received"
  | "rating.visible"
  | "document.approved"
  | "document.rejected"
  | "document.expiring"
  | "account.approved"
  | "account.rejected"
  | "account.suspended"
  | "account.reactivated"
  | "account.mfa_cleared"
  | "account.viewed"
  | "billing.trial_ending"
  | "billing.payment_failed";

/** The switches a user actually sees. Events are grouped under these. */
export type NotificationCategory =
  | "matchingLoads"
  | "assignments"
  | "messages"
  | "documentExpiry"
  | "account"
  | "billing"
  | "marketing";

/**
 * SMS is deliberately absent.
 *
 * The founder's decision, taken after I3: contact details are revealed the
 * moment somebody is hired (ADR-8), so both parties already have each other's
 * numbers and the call button is a plain `tel:` link. A masked-number service
 * (ADR-15) exists for strangers who should not exchange numbers, which is not
 * this product. `/api/sms` and `/api/calls` are deleted rather than left
 * refusing.
 */
/**
 * Push is the channel that reaches somebody who is not looking at the app.
 *
 * It needs no vendor: every browser ships a push service and the open
 * protocol for reaching it is VAPID, with a key pair we generated ourselves
 * (`src/server/vapid.server.ts`). It carries **no payload** — the phone is
 * woken and the worker fetches the notification itself, so nothing about a
 * job passes through Google's or Apple's servers.
 *
 * It is the most intrusive thing we have, so a row only gets it if the answer
 * to "would somebody want their phone to buzz at this?" is yes. Quiet hours
 * and the category switches apply to it exactly as they do to email.
 */
export type Channel = "in_app" | "email" | "push";

export interface EventDefinition {
  /** Which preference switch governs it. */
  category: NotificationCategory;
  /** Channels this event may use, in addition to in-app. Email, or nothing. */
  channels: Channel[];
  /**
   * Whether it may break quiet hours.
   *
   * Reserved for things that change what somebody has to do tomorrow morning.
   */
  urgent: boolean;
  /** Short, and it says what happened rather than that something happened. */
  title: (v: Vars) => string;
  body: (v: Vars) => string;
}

/** What a notification is allowed to interpolate. Deliberately small. */
export interface Vars {
  reference?: string;
  loadTitle?: string;
  personName?: string;
  companyName?: string;
  amount?: string;
  status?: string;
  reason?: string;
  days?: number;
  documentLabel?: string;
  route?: string;
}

const v = (value: string | undefined, fallback: string) => value?.trim() || fallback;

export const CATALOG: Record<NotificationEvent, EventDefinition> = {
  "load.matching": {
    category: "matchingLoads",
    channels: ["email"],
    urgent: false,
    title: (x) => `New escort work in ${v(x.route, "your regions")}`,
    body: (x) =>
      `${v(x.reference, "A load")} — ${v(x.loadTitle, "an escort job")}${
        x.amount ? `, ${x.amount}` : ""
      }. It matches the regions you work and what you carry.`,
  },

  "load.cancelled": {
    category: "assignments",
    channels: ["email", "push"],
    urgent: true,
    title: (x) => `${v(x.reference, "A load")} was cancelled`,
    body: (x) =>
      `${v(x.companyName, "The dispatcher")} cancelled ${v(x.reference, "the load")}${
        x.reason ? `: ${x.reason}` : "."
      } Nothing is expected of you.`,
  },

  "offer.received": {
    category: "assignments",
    channels: ["email", "push"],
    urgent: false,
    title: (x) => `A pilot wants ${v(x.reference, "your load")}`,
    body: (x) =>
      `${v(x.personName, "A pilot")} offered${x.amount ? ` ${x.amount}` : ""} for a position on ${v(
        x.reference,
        "your load",
      )}.`,
  },

  "position.filled": {
    category: "assignments",
    channels: ["email"],
    urgent: false,
    title: (x) => `${v(x.personName, "A pilot")} took a position on ${v(x.reference, "your load")}`,
    body: (x) =>
      `They are hired at the price you posted${x.amount ? ` (${x.amount})` : ""}. Their phone number and vehicle are on the load now.`,
  },

  "offer.accepted": {
    category: "assignments",
    channels: ["email", "push"],
    // The job is now theirs and they have to be somewhere.
    urgent: true,
    title: (x) => `You got ${v(x.reference, "the job")}`,
    body: (x) =>
      `${v(x.companyName, "The dispatcher")} hired you for ${v(x.reference, "the load")}${
        x.amount ? ` at ${x.amount}` : ""
      }. The yard address and who to call are on the job now.`,
  },

  "offer.declined": {
    category: "assignments",
    channels: ["email"],
    urgent: false,
    title: (x) => `Not this time on ${v(x.reference, "that load")}`,
    body: (x) =>
      `${v(x.companyName, "The dispatcher")} went with somebody else${
        x.reason ? `: ${x.reason}` : "."
      } Your other bids are unaffected.`,
  },

  "assignment.status": {
    category: "assignments",
    channels: [],
    // A status change is worth seeing in the app; it is not worth an email
    // four times per job, and it never has to wake anybody.
    urgent: false,
    title: (x) => `${v(x.personName, "Your pilot")} is ${v(x.status, "moving")}`,
    body: (x) => `${v(x.reference, "The job")} — ${v(x.status, "the status changed")}.`,
  },

  "assignment.completed": {
    category: "assignments",
    channels: ["email"],
    urgent: false,
    title: (x) => `${v(x.reference, "The job")} is finished`,
    body: (x) =>
      `${v(x.personName, "The pilot")} closed ${v(
        x.reference,
        "the job",
      )}. You can rate each other now, and the job sheet is the record.`,
  },

  "assignment.cancelled": {
    category: "assignments",
    channels: ["email", "push"],
    // Somebody has cleared their week, or lost their escort. Both need to know.
    urgent: true,
    title: (x) => `${v(x.reference, "A job")} was cancelled`,
    body: (x) =>
      `${v(x.personName, "The other party")} cancelled ${v(x.reference, "the job")}${
        x.reason ? `: ${x.reason}` : "."
      }`,
  },

  "assignment.no_show": {
    category: "assignments",
    channels: ["email", "push"],
    urgent: true,
    title: (x) => `${v(x.companyName, "A dispatcher")} recorded that you did not arrive`,
    body: (x) =>
      `On ${v(x.reference, "a job")}${
        x.reason ? `: ${x.reason}` : "."
      } If that is wrong, contact them — it is on your record.`,
  },

  "message.received": {
    category: "messages",
    channels: ["push"],
    /*
     * Push but never email, and never urgent enough to break quiet hours.
     *
     * Emailing every message would make the inbox the conversation, and a job
     * that is running is one where both people already have each other's phone
     * numbers (ADR-8). But the message that arrives while the app is shut was
     * the gap this row was written around, and push is what closes it.
     */
    urgent: false,
    title: (x) => `${v(x.personName, "Somebody")} messaged you`,
    body: (x) => `${v(x.reference, "On a job")}: ${v(x.reason, "a new message")}`,
  },

  "rating.visible": {
    category: "assignments",
    channels: [],
    urgent: false,
    title: () => "You can read your rating now",
    body: (x) =>
      `You have both rated ${v(x.reference, "the job")}, so each of you can see what the other said.`,
  },

  "document.approved": {
    category: "account",
    channels: ["email"],
    urgent: false,
    title: (x) => `Your ${v(x.documentLabel, "document")} was approved`,
    body: () => "It counts towards the work you are eligible for from now on.",
  },

  "document.rejected": {
    category: "account",
    channels: ["email"],
    urgent: false,
    title: (x) => `Your ${v(x.documentLabel, "document")} was not accepted`,
    body: (x) => `${v(x.reason, "The reviewer gave no reason.")} You can upload a new one.`,
  },

  "document.expiring": {
    category: "documentExpiry",
    channels: ["email"],
    // Not switchable, and it can break quiet hours: a pilot whose insurance
    // lapses tonight cannot legally take tomorrow's job.
    urgent: true,
    title: (x) =>
      x.days === 0
        ? `Your ${v(x.documentLabel, "document")} expires today`
        : `Your ${v(x.documentLabel, "document")} expires in ${x.days} days`,
    body: () =>
      "Work you are eligible for stops the day it lapses. Upload the new one before then.",
  },

  "account.approved": {
    category: "account",
    channels: ["email"],
    urgent: false,
    title: () => "Your account is approved",
    body: () => "You can take work now. Finish your profile if anything is still missing.",
  },

  "account.rejected": {
    category: "account",
    channels: ["email"],
    urgent: false,
    title: () => "Your account was not approved",
    body: (x) => v(x.reason, "Contact support if you think this is wrong."),
  },

  "account.suspended": {
    category: "account",
    channels: ["email", "push"],
    // Their livelihood has just stopped working. It cannot wait for morning.
    urgent: true,
    title: () => "Your account has been suspended",
    body: (x) => `${v(x.reason, "No reason was given.")} You cannot sign in until it is lifted.`,
  },

  "account.reactivated": {
    category: "account",
    channels: ["email"],
    urgent: true,
    title: () => "Your account is active again",
    body: () => "You can sign in and take work as before.",
  },

  "account.mfa_cleared": {
    category: "account",
    channels: ["email", "push"],
    /*
     * Somebody's second factor was removed. If it was not at their request,
     * this is the message that tells them their account is being tampered with.
     */
    urgent: true,
    title: () => "Your two-factor sign-in was removed",
    body: (x) =>
      `An administrator removed it: ${v(x.reason, "no reason given")}. Set up a new one the next time you sign in. If you did not ask for this, contact us.`,
  },

  "account.viewed": {
    category: "account",
    channels: ["email", "push"],
    urgent: false,
    title: () => "An administrator looked at your account",
    body: (x) =>
      `Read-only, for 15 minutes, and nothing was changed. Reason given: ${v(x.reason, "none")}.`,
  },

  "billing.trial_ending": {
    category: "billing",
    channels: ["email"],
    urgent: false,
    title: (x) => (x.days === 0 ? "Your trial ends today" : `Your trial ends in ${x.days} days`),
    body: () => "After that you will not be able to bid on or accept loads until you subscribe.",
  },

  "billing.payment_failed": {
    category: "billing",
    channels: ["email"],
    urgent: false,
    title: () => "Your payment did not go through",
    body: () =>
      "You keep access for a few days while it is sorted out. Update your card to avoid losing it.",
  },
};

/**
 * Categories a person can switch off.
 *
 * `documentExpiry` is not among them, for the same reason it is not in the
 * preferences UI: a pilot who mutes the warning that their insurance is about
 * to lapse arrives at a job uninsured, and the dispatcher who hired them
 * carries that.
 */
export const MUTABLE_CATEGORIES: NotificationCategory[] = [
  "matchingLoads",
  "assignments",
  "messages",
  "account",
  "billing",
  "marketing",
];

export const CATEGORY_LABELS: Record<NotificationCategory, { label: string; note: string }> = {
  matchingLoads: {
    label: "New work in your regions",
    note: "Loads that match the regions you work and what you carry.",
  },
  assignments: {
    label: "Offers and jobs",
    note: "Bids, hiring, cancellations and jobs finishing.",
  },
  messages: { label: "Messages", note: "Messages on a job you are working." },
  documentExpiry: {
    label: "Expiring documents",
    note: "Always on. Work stops the day a certificate lapses.",
  },
  account: { label: "Your account", note: "Approvals, and document reviews." },
  billing: { label: "Subscription", note: "Trial ending, and payment problems." },
  marketing: { label: "Product news", note: "Occasional. Off unless you ask for it." },
};

export const eventDefinition = (event: NotificationEvent): EventDefinition => CATALOG[event];

/** Every event that belongs to a category. Used by the preferences screen. */
export function eventsInCategory(category: NotificationCategory): NotificationEvent[] {
  return (Object.keys(CATALOG) as NotificationEvent[]).filter(
    (e) => CATALOG[e].category === category,
  );
}
