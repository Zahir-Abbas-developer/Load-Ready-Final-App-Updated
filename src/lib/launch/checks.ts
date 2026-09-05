/**
 * Whether a configuration is fit to be public, and exactly what is missing.
 *
 * Pure on purpose: it takes an environment and returns a list, so the same
 * code answers for the running server, for `npm run preflight`, and for a test
 * that fabricates a half-finished host. A launch checklist kept in a document
 * drifts from the code within a phase or two; this one cannot claim something
 * is set when it is not.
 *
 * Three severities, and the distinction is the point:
 *
 * - **blocking** — do not put this on the internet. Somebody takes the
 *   platform over, or the records disappear.
 * - **degraded** — it will run, and something real will not work. A pilot will
 *   not be told they were hired.
 * - **optional** — a feature that is simply off, and says so on screen.
 */

export type Severity = "blocking" | "degraded" | "optional";

export interface Check {
  /** Reads as a statement of fact when it passes. */
  name: string;
  severity: Severity;
  ok: boolean;
  /** What is true right now. One line, no jargon. */
  detail: string;
  /** What to do about it. Present only when it is not ok. */
  fix?: string;
}

export type Env = Record<string, string | undefined>;

const set = (env: Env, key: string): boolean => Boolean(env[key]?.trim());

/** The three seeded accounts, and the variable that gives each a real password. */
const SEEDED = [
  { email: "admin@bwm.test", key: "LOADREADY_ADMIN_PASSWORD" },
  { email: "dispatcher@bwm.test", key: "LOADREADY_DISPATCHER_PASSWORD" },
  { email: "pilot@bwm.test", key: "LOADREADY_PILOT_PASSWORD" },
];

export const isProduction = (env: Env): boolean =>
  env.LOADREADY_ENV?.trim().toLowerCase() === "production";

export function launchChecks(env: Env): Check[] {
  const checks: Check[] = [];

  // ── blocking ─────────────────────────────────────────────────────────────

  /*
   * The one that would end the company.
   *
   * The seeded team accounts exist so a fresh checkout works. Their passwords
   * are in CLAUDE.md, in every phase report and in the git history — and an
   * administrator can read any job, suspend anybody and view as any account.
   * A public deployment that still has them is an account takeover waiting for
   * whoever reads the repository first.
   */
  const published = SEEDED.filter((a) => !set(env, a.key)).map((a) => a.email);
  checks.push({
    name: "The team accounts do not use their published passwords",
    severity: "blocking",
    ok: published.length === 0,
    detail:
      published.length === 0
        ? "Every seeded account takes its password from the environment."
        : `${published.join(", ")} would use the password written in this repository.`,
    fix: "Set LOADREADY_ADMIN_PASSWORD, LOADREADY_DISPATCHER_PASSWORD and LOADREADY_PILOT_PASSWORD, and the matching _EMAIL values so the addresses are ones you can receive mail at.",
  });

  const production = isProduction(env);
  checks.push({
    name: "The server knows it is in production",
    severity: "blocking",
    ok: production,
    detail: production
      ? "LOADREADY_ENV is production."
      : "LOADREADY_ENV is unset, so this server believes it is a development copy.",
    fix: "Set LOADREADY_ENV=production. It is not a label: it is what stops the app creating accounts with published passwords.",
  });

  const dataDir = env.LOADREADY_DATA_DIR?.trim();
  checks.push({
    name: "Records are written somewhere that survives a deploy",
    severity: "blocking",
    ok: Boolean(dataDir),
    detail: dataDir
      ? `Records are written to ${dataDir}.`
      : "Records go to .data beside the code, which most hosts replace on every deploy.",
    fix: "Point LOADREADY_DATA_DIR at a persistent volume. Everything the product knows — accounts, loads, jobs, messages, positions — lives there, and there is no database behind it yet (F-01).",
  });

  // ── degraded ─────────────────────────────────────────────────────────────

  const email = set(env, "RESEND_API_KEY") && set(env, "MAIL_FROM");
  checks.push({
    name: "Email can be sent",
    severity: "degraded",
    ok: email,
    detail: email
      ? "Resend is configured."
      : "No email provider, so a signup verification code is written to the server log instead of sent — nobody outside the team can finish signing up.",
    fix: "Set RESEND_API_KEY and MAIL_FROM.",
  });

  const webPush =
    set(env, "LOADREADY_VAPID_PUBLIC_KEY") &&
    set(env, "LOADREADY_VAPID_PRIVATE_KEY") &&
    set(env, "LOADREADY_VAPID_SUBJECT");
  checks.push({
    name: "Notifications reach a phone",
    severity: "degraded",
    ok: webPush,
    detail: webPush
      ? "Web push keys are set."
      : "No push keys, so a pilot with the app closed is not told they were hired or that a job was cancelled.",
    fix: "Run npm run vapid:keys and set the three LOADREADY_VAPID_* values. No account and no cost.",
  });

  // ── optional ─────────────────────────────────────────────────────────────

  const stripe = env.LOADREADY_BILLING?.trim().toLowerCase() === "stripe";
  checks.push({
    name: "Pilots can pay for themselves",
    severity: "optional",
    ok: stripe,
    detail: stripe
      ? "Stripe is selected."
      : "Billing is manual: checkout is refused and an administrator grants access by hand, with a reason and an audit entry.",
    fix: "Finish Phase D2, then set LOADREADY_BILLING=stripe. Until then the product works — somebody has to press a button.",
  });

  const firebase = set(env, "LOADREADY_FIREBASE_SERVICE_ACCOUNT");
  checks.push({
    name: "The native app can be notified",
    severity: "optional",
    ok: firebase,
    detail: firebase
      ? "Firebase is configured."
      : "No Firebase, so the native app receives nothing. The web app is unaffected.",
    fix: "Set LOADREADY_FIREBASE_SERVICE_ACCOUNT. Only needed once there is an app in a store.",
  });

  const android =
    set(env, "LOADREADY_ANDROID_PACKAGE") && set(env, "LOADREADY_ANDROID_FINGERPRINTS");
  const apple = set(env, "LOADREADY_IOS_TEAM_ID") && set(env, "LOADREADY_IOS_BUNDLE_ID");
  checks.push({
    name: "Links open the app rather than the browser",
    severity: "optional",
    ok: android && apple,
    detail:
      android && apple
        ? "Both association files are published."
        : `Android ${android ? "yes" : "no"}, Apple ${apple ? "yes" : "no"}. Unpublished on purpose until an app exists — a wrong one is worse than none.`,
    fix: "Set the LOADREADY_ANDROID_* and LOADREADY_IOS_* values once the store accounts exist.",
  });

  return checks;
}

export interface Readiness {
  /** True only when nothing blocking is outstanding. */
  ready: boolean;
  blocking: number;
  degraded: number;
  checks: Check[];
}

export function summarise(checks: Check[]): Readiness {
  const failing = (severity: Severity) =>
    checks.filter((c) => !c.ok && c.severity === severity).length;

  return {
    ready: failing("blocking") === 0,
    blocking: failing("blocking"),
    degraded: failing("degraded"),
    checks,
  };
}
