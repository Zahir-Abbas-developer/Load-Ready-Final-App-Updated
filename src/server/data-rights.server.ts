/**
 * Export and deletion — the two things a privacy policy promises and most
 * products make you email somebody for.
 *
 * Both are self-serve here. Apple and Google require account deletion to be
 * startable inside the app, and "email privacy@loadready.ai", which is what the
 * website says today, does not satisfy either of them.
 *
 * The rule for export: **only this person's own data.** A trip conversation has
 * two sides, and the other side's words are not this person's to take away.
 *
 * The rule for deletion: **everything about them goes, and what stays is about
 * somebody else.** The administrator audit log is the record of what a
 * privileged user did; it survives, and once the account row is gone its
 * subject id no longer resolves to a person. A rating they wrote is the other
 * person's record and stays with the author unlinked; ratings about them go.
 *
 * Loads, bids and finished jobs are **not** deleted, and that is an open
 * question rather than a decision I made quietly: they are also the other
 * party's business record of an escort that really happened, and there may be
 * a retention duty attached to permitted movements. Flagged for the founder
 * (BACKLOG F-84); a live job blocks the deletion request outright.
 *
 * Never import this from client code.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { dataFile } from "./data-dir";
import { deletePushData, pushDataFor } from "./push-store.server";
import { accountExport, purgeAccount, accountsDueForDeletion } from "./auth-store.server";
import { deleteProfileData, fileIdsFor, profileDataFor } from "./profile-store.server";
import { deletePreferences, preferencesFor } from "./preferences-store.server";
import { deleteBillingData, subscriptionFor } from "./billing-store.server";
import { acceptancesFor, deleteAcceptances } from "./legal-store.server";
import { deleteMessagesBy, messagesBy, proofsBy } from "./message-store.server";
import { assignmentsForDispatcher, assignmentsForPilot, offersByPilot } from "./offer-store.server";
import { loadsFor } from "./load-store.server";
import { deleteRatingData, ratingDataFor } from "./ratings-store.server";
import { deleteNotificationData, notificationDataFor } from "./notification-store.server";
import { deleteTrackingData, trackingDataFor } from "./tracking-store.server";
import { deleteReportsBy, readsAbout, reportsBy } from "./dispute-store.server";
import { filesOwnedBy, purgeFilesOwnedBy, signFileToken } from "./file-store.server";
import { recordAudit } from "./audit-store.server";
import { COMPANY } from "@/lib/legal/documents";

const RECEIPTS_FILE = dataFile("deletion-receipts.json");

/**
 * What is left behind after an account is deleted.
 *
 * Deliberately not personal data: an opaque id, a date, and counts. It exists
 * because "prove you deleted my data" is a question that gets asked, and
 * answering it needs a record that is not itself a copy of what was deleted.
 */
export interface DeletionReceipt {
  userId: string;
  requestedAt: string | null;
  completedAt: string;
  removed: {
    profile: boolean;
    company: boolean;
    documents: number;
    files: number;
    messages: number;
    legalAcceptances: number;
    preferences: boolean;
    subscription: boolean;
    /** Scores about them. Scores they wrote stay, with the author unlinked. */
    ratings: number;
    /** Their notifications and the delivery attempts behind them. */
    notifications: number;
    /** Every location fix recorded while they were working. */
    positions: number;
    /** Browsers that were allowed to notify them. */
    devices: number;
  };
}

function loadReceipts(): DeletionReceipt[] {
  if (!existsSync(RECEIPTS_FILE)) return [];
  try {
    const raw = JSON.parse(readFileSync(RECEIPTS_FILE, "utf8"));
    return Array.isArray(raw) ? raw : [];
  } catch (err) {
    console.error("[data-rights] could not read deletion receipts", err);
    return [];
  }
}

function saveReceipt(receipt: DeletionReceipt) {
  try {
    mkdirSync(dirname(RECEIPTS_FILE), { recursive: true });
    const tmp = `${RECEIPTS_FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify([...loadReceipts(), receipt], null, 2), "utf8");
    renameSync(tmp, RECEIPTS_FILE);
  } catch (err) {
    // Failing to write the receipt must not stop the deletion — the person
    // asked to be forgotten and that comes first.
    console.error("[data-rights] could not write the deletion receipt", err);
  }
}

export const deletionReceipts = () => loadReceipts();

// ── export ─────────────────────────────────────────────────────────────────

/**
 * Everything held about one person, as a single object.
 *
 * Documents are listed with a link rather than embedded: a driving licence
 * photo inlined as base64 turns a small file into a large one and puts the
 * image itself into whatever the browser saves to disk. The links are the same
 * five-minute signed links the app uses everywhere else.
 */
export async function exportUserData(userId: string): Promise<Record<string, unknown> | null> {
  const account = await accountExport(userId);
  if (!account) return null;

  const { pilot, company } = profileDataFor(userId);
  const files = filesOwnedBy(userId);

  return {
    exportedAt: new Date().toISOString(),
    about: {
      whatThisIs:
        "Everything LoadReady holds about this account. Messages are the ones you sent; the other party's are theirs, not yours.",
      contact: COMPANY.privacy,
    },
    account,
    pilotProfile: pilot,
    company,
    preferences: preferencesFor(userId, pilot?.profile.country ?? company?.country),
    subscription: subscriptionFor(userId),
    legalAcceptances: acceptancesFor(userId),
    messagesYouSent: messagesBy(userId),
    proofYouAttached: proofsBy(userId),
    /*
     * The work itself.
     *
     * A pilot's bids and the jobs they were hired for, or a dispatcher's
     * loads and who they hired — this is the part of the export somebody
     * actually wants when they are reconstructing a season's work for their
     * accountant or an insurer.
     */
    loadsYouPosted: loadsFor(userId),
    bidsYouMade: offersByPilot(userId),
    jobs: [...assignmentsForPilot(userId), ...assignmentsForDispatcher(userId)],
    ratings: ratingDataFor(userId),
    /*
     * What we told them, and what we tried to send.
     *
     * "Was I ever told?" is the question this answers, and it is the one
     * somebody asks when a job went wrong — so the delivery attempts are in
     * here too, not only the notifications they saw.
     */
    ...notificationDataFor(userId),
    /*
     * Every position ever recorded about them, and when they agreed to it.
     *
     * This is the most sensitive thing the export contains — a week of an
     * escort's movements — which is exactly why it has to be in here rather
     * than only in our files.
     */
    ...trackingDataFor(
      userId,
      assignmentsForPilot(userId).map((a) => a.id),
    ),
    /*
     * The browsers allowed to wake their phone.
     *
     * Without the endpoints — those are live credentials for sending to the
     * device, and an export is a file that ends up in an inbox.
     */
    devicesThatCanNotifyYou: pushDataFor(userId),
    reportsYouMade: reportsBy(userId),
    /*
     * Every time an administrator read something private on a job of theirs.
     *
     * "Who has read my messages, and when" is a question people are entitled
     * to an answer to, and one nobody can answer from a support queue.
     */
    whenAnAdministratorLooked: readsAbout([
      ...assignmentsForPilot(userId).map((a) => a.id),
      ...assignmentsForDispatcher(userId).map((a) => a.id),
    ]),
    files: files.map((file) => ({
      id: file.id,
      name: file.originalName,
      type: file.mime,
      bytes: file.bytes,
      uploadedAt: file.createdAt,
      detachedAt: file.detachedAt,
      // Valid for five minutes from the moment this export was made.
      downloadUrl: `/api/files?id=${file.id}&token=${signFileToken(file.id, userId)}`,
    })),
  };
}

// ── deletion ───────────────────────────────────────────────────────────────

/**
 * Removes everything, in an order that cannot strand anything.
 *
 * The account row goes **last**: it is the only thing that maps this id to a
 * person, and losing it first would leave the profile, the files and the
 * messages behind with nothing to find them by.
 */
export async function hardDeleteAccount(
  userId: string,
  requestedAt: string | null,
): Promise<DeletionReceipt> {
  const { pilot } = profileDataFor(userId);
  const documents = pilot?.documents.length ?? 0;

  // Collected before the profile goes, because that is what names them.
  const attachedFiles = fileIdsFor(userId);

  const messages = deleteMessagesBy(userId);
  const legalAcceptances = deleteAcceptances(userId);
  const preferences = deletePreferences(userId);
  const subscription = deleteBillingData(userId);
  const ratings = deleteRatingData(userId);
  const notifications = deleteNotificationData(userId);
  const devices = deletePushData(userId);
  deleteReportsBy(userId);
  const positions = deleteTrackingData(
    userId,
    assignmentsForPilot(userId).map((a) => a.id),
  );
  const { pilot: hadPilot, company: hadCompany } = deleteProfileData(userId);

  // Purges by owner as well as by attachment, so a file uploaded and never
  // attached to anything still goes.
  const files = Math.max(purgeFilesOwnedBy(userId), attachedFiles.length);

  await purgeAccount(userId);

  const receipt: DeletionReceipt = {
    userId,
    requestedAt,
    completedAt: new Date().toISOString(),
    removed: {
      profile: hadPilot,
      company: hadCompany,
      documents,
      files,
      messages,
      legalAcceptances,
      preferences,
      subscription,
      ratings: ratings.received,
      notifications,
      positions,
      devices,
    },
  };
  saveReceipt(receipt);

  recordAudit({
    actorId: "system",
    actorEmail: "system",
    action: "account.deleted",
    subject: userId,
    detail: `Grace period elapsed. Removed ${files} file(s), ${messages} message(s), ${legalAcceptances} acceptance(s).`,
  });

  return receipt;
}

/**
 * Finishes every deletion whose grace period has run out.
 *
 * Called on a timer and on startup rather than by a cron service, because there
 * is no cron here yet — pg_cron arrives with Postgres (BACKLOG F-01). The
 * effect is the same as long as the server runs; if it is down for a week, a
 * deletion completes late rather than not at all.
 */
export async function runDueDeletions(now = Date.now()): Promise<DeletionReceipt[]> {
  const due = await accountsDueForDeletion(now);
  const done: DeletionReceipt[] = [];
  for (const user of due) {
    done.push(await hardDeleteAccount(user.id, user.deletionRequestedAt ?? null));
  }
  return done;
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Starts the hourly sweep. Safe to call more than once. */
export function startDeletionSweep(intervalMs = 60 * 60 * 1000) {
  if (timer) return;
  const sweep = () => {
    void runDueDeletions().then((done) => {
      if (done.length > 0) console.log(`[data-rights] completed ${done.length} deletion(s)`);
    });
  };
  sweep();
  timer = setInterval(sweep, intervalMs);
  // Never the reason the process refuses to exit.
  timer.unref?.();
}

/** Test seam. */
export function stopDeletionSweep() {
  if (timer) clearInterval(timer);
  timer = null;
}
