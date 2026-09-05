/**
 * Authorization, in one place.
 *
 * Before this, every route hand-wrote `if (caller.role !== "admin") return 403`.
 * That worked, and it is exactly the shape of thing that fails silently: a new
 * action added to a `switch` inherits no check at all, and nothing tells you.
 * Two endpoints had already been written with no session check whatsoever.
 *
 * So the rule for each action is data, in `POLICY` below, and the tests
 * enumerate it. An action missing from the table is denied — the default is no,
 * which is the only default that fails safe.
 *
 * Never import this from client code.
 */
import {
  adminNeedsMfa,
  readSessionCookie,
  userForToken,
  type Role,
  impersonationOf,
  type SafeUser,
} from "./auth-store.server";
import { settings } from "./settings-store.server";
import { flagClosing } from "@/lib/settings/flags";

export type Actor = "public" | Role;

export interface Policy {
  /** Who may call it. `public` means no session is needed. */
  allow: Actor[];
  /** Mutating actions are origin-checked; reads are not. */
  mutating: boolean;
  /** Why, in a sentence. Read by the security review, not by the code. */
  note: string;
}

const PUBLIC: Actor[] = ["public"];
const SIGNED_IN: Actor[] = ["pilot", "dispatcher", "admin"];
const ADMIN: Actor[] = ["admin"];

/**
 * The authorization matrix.
 *
 * Keyed `"<route>:<action>"`. A route with no actions uses the HTTP verb.
 */
export const POLICY: Record<string, Policy> = {
  // ── /api/auth ────────────────────────────────────────────────────────────
  "auth:GET": {
    allow: PUBLIC,
    mutating: false,
    note: "Restores a session on page load. Returns null when there is no cookie.",
  },
  "auth:signup": {
    allow: PUBLIC,
    mutating: true,
    note: "Anyone may ask for an account. Answers identically whether or not the address is taken.",
  },
  "auth:verify-otp": {
    allow: PUBLIC,
    mutating: true,
    note: "Completes a signup with the emailed code. Creates the account, still unapproved.",
  },
  "auth:resend-otp": {
    allow: PUBLIC,
    mutating: true,
    note: "Sends the verification code again, behind a cooldown and an hourly budget.",
  },
  "auth:request-password-reset": {
    allow: PUBLIC,
    mutating: true,
    note: "For locked-out users. Answers identically for a known and an unknown address.",
  },
  "auth:reset-password": {
    allow: PUBLIC,
    mutating: true,
    note: "Whoever holds a valid single-use token. Drops every session for that account.",
  },
  "auth:login": {
    allow: PUBLIC,
    mutating: true,
    note: "Signing in. Only a wrong password spends rate-limit budget.",
  },
  "auth:logout": {
    allow: PUBLIC,
    mutating: true,
    note: "Always allowed, even with no session — refusing a sign-out helps nobody.",
  },
  "auth:verify-mfa": {
    allow: PUBLIC,
    mutating: true,
    note: "Exchanges a sign-in challenge and a code for a session. Five attempts per challenge.",
  },
  "auth:mfa-status": {
    allow: SIGNED_IN,
    mutating: false,
    note: "Whether your own account has a second factor, and how many recovery codes are left.",
  },
  "auth:mfa-begin": {
    allow: SIGNED_IN,
    mutating: true,
    note: "Generates a secret for your own account. Nothing is switched on until a code proves it.",
  },
  "auth:mfa-confirm": {
    allow: SIGNED_IN,
    mutating: true,
    note: "Proves the secret reached a working app and returns the recovery codes, once.",
  },
  "auth:mfa-disable": {
    allow: SIGNED_IN,
    mutating: true,
    note: "Turns off your own second factor. Needs the password and a current code.",
  },
  "auth:list-accounts": {
    allow: ADMIN,
    mutating: false,
    note: "Every account on the platform, with role and approval state.",
  },
  "auth:decide": { allow: ADMIN, mutating: true, note: "Approves or rejects a signup. Audited." },

  // ── /api/billing ─────────────────────────────────────────────────────────
  "billing:GET": {
    allow: SIGNED_IN,
    mutating: false,
    note: "Pilots get their subscription; everyone else is told billing does not apply (ADR-1).",
  },
  "billing:start-checkout": {
    allow: ["pilot"],
    mutating: true,
    note: "Only pilots pay. The manual provider refuses rather than granting access.",
  },
  "billing:admin-read": {
    allow: ADMIN,
    mutating: false,
    note: "Another account subscription and the decisions taken on it.",
  },
  "billing:admin-set-override": {
    allow: ADMIN,
    mutating: true,
    note: "Grants or suspends paid access. Audited, with a reason.",
  },

  // ── /api/profile ─────────────────────────────────────────────────────────
  "profile:GET": {
    allow: SIGNED_IN,
    mutating: false,
    note: "Your own profile, company or preferences. Never another account.",
  },
  "profile:update-profile": {
    allow: ["pilot"],
    mutating: true,
    note: "Your own pilot profile. The store copies whitelisted fields only, so a verification status sent in the body never lands.",
  },
  "profile:add-document": {
    allow: ["pilot"],
    mutating: true,
    note: "Attaches an uploaded file to your own record; the file must already belong to you.",
  },
  "profile:remove-document": {
    allow: ["pilot"],
    mutating: true,
    note: "Detaches one of your own documents. The bytes are kept for the audit trail.",
  },
  "profile:add-certification": {
    allow: ["pilot"],
    mutating: true,
    note: "A region certification on your own record. The region must be in the catalogue.",
  },
  "profile:remove-certification": {
    allow: ["pilot"],
    mutating: true,
    note: "Removes a certification from your own record, by id.",
  },
  "profile:save-vehicle": {
    allow: ["pilot"],
    mutating: true,
    note: "Creates or updates a vehicle on your own record. Equipment comes from the catalogue.",
  },
  "profile:remove-vehicle": {
    allow: ["pilot"],
    mutating: true,
    note: "Removes a vehicle from your own record, by id.",
  },
  "profile:submit-for-review": {
    allow: ["pilot"],
    mutating: true,
    note: "Moves your own profile to in_review. Refused while anything required is missing.",
  },
  "profile:update-company": {
    allow: ["dispatcher"],
    mutating: true,
    note: "Your own company profile. USDOT and MC numbers are format-checked, not verified.",
  },
  "profile:update-preferences": {
    allow: SIGNED_IN,
    mutating: true,
    note: "Your own units, time zone and notifications. Document-expiry alerts cannot be muted.",
  },
  "profile:review-queue": {
    allow: ADMIN,
    mutating: false,
    note: "Every pilot record and every document, for review.",
  },
  "profile:review-document": {
    allow: ADMIN,
    mutating: true,
    note: "Approves or rejects one document. A rejection needs a reason.",
  },
  "profile:review-profile": {
    allow: ADMIN,
    mutating: true,
    note: "Approves or rejects a whole pilot. Audited.",
  },

  // ── /api/files ───────────────────────────────────────────────────────────
  "files:GET": {
    allow: SIGNED_IN,
    mutating: false,
    note: "Your own file, or any file as an administrator, and only with a signed token bound to you.",
  },
  "files:POST": {
    allow: SIGNED_IN,
    mutating: true,
    note: "Uploads a file you own, or mints a five-minute link to one you may read.",
  },

  // ── /api/account ─────────────────────────────────────────────────────────
  "account:export": {
    allow: SIGNED_IN,
    mutating: true,
    note: "A copy of your own data. Only yours — the other side of a conversation is not yours to take.",
  },
  "account:request-deletion": {
    allow: SIGNED_IN,
    mutating: true,
    note: "Starts deletion of your own account. Needs the password again, and drops every session.",
  },
  "account:cancel-deletion": {
    allow: SIGNED_IN,
    mutating: true,
    note: "Changes your mind inside the grace period.",
  },
  "account:deletion-status": {
    allow: SIGNED_IN,
    mutating: false,
    note: "Whether your own account is scheduled for deletion, and when it completes.",
  },

  // ── /api/loads ───────────────────────────────────────────────────────────
  "loads:GET": {
    allow: SIGNED_IN,
    mutating: false,
    note: "A dispatcher's own loads in full, or a pilot's board with the masked view and why each one is or is not theirs to take.",
  },
  "loads:estimate-distance": {
    allow: ["dispatcher"],
    mutating: true,
    note: "Works out how far a load is going from the two cities. Only the city and state are sent to the geocoder — never the street address, which is the thing ADR-8 hides until somebody is hired. Rate limited: it calls an outside service, and the free one is free on condition of light use.",
  },
  "loads:create": {
    allow: ["dispatcher"],
    mutating: true,
    note: "Posting is free and always will be — no subscription is checked here (ADR-1).",
  },
  "loads:update": {
    allow: ["dispatcher"],
    mutating: true,
    note: "A draft you own. A posted load cannot be edited: pilots offered on what it said.",
  },
  "loads:publish": {
    allow: ["dispatcher"],
    mutating: true,
    note: "Makes a draft you own visible to matched pilots. Refused while anything required is missing.",
  },
  "loads:cancel": {
    allow: ["dispatcher"],
    mutating: true,
    note: "Cancels a load you own. Needs a reason, because the pilots who offered are told it.",
  },

  // ── /api/offers ──────────────────────────────────────────────────────────
  "offers:GET": {
    allow: SIGNED_IN,
    mutating: false,
    note: "A pilot's own offers and assignments, or the applicants on a load you posted. Contact details appear only where an assignment exists (ADR-8).",
  },
  "offers:offer": {
    allow: ["pilot"],
    mutating: true,
    note: "Offer on a position. Eligibility and entitlement are re-checked here; the board's version is guidance, this is the gate.",
  },
  "offers:withdraw": {
    allow: ["pilot"],
    mutating: true,
    note: "Withdraws your own live offer.",
  },
  "offers:accept": {
    allow: ["dispatcher"],
    mutating: true,
    note: "Hires a pilot for one position. Re-checks their eligibility at this moment, not when they bid, and declines the other offers on that position.",
  },
  "offers:decline": {
    allow: ["dispatcher"],
    mutating: true,
    note: "Turns down one offer on a load you posted. A reason is optional and stored when given.",
  },
  "offers:assignment-status": {
    allow: ["pilot"],
    mutating: false,
    note: "Your own assignment on one load, with the details revealed by it.",
  },

  // ── /api/assignments ─────────────────────────────────────────────────────
  "assignments:GET": {
    allow: SIGNED_IN,
    mutating: false,
    note: "The jobs you are on — yours as the pilot, or yours as the dispatcher who hired. The other side's rating is withheld until you have written yours.",
  },
  "assignments:advance": {
    allow: ["pilot"],
    mutating: true,
    note: "Moves the job on one step. Pilots only: a dispatcher marking a job 'at the pickup' would be recording something they cannot see.",
  },
  "assignments:complete": {
    allow: ["pilot"],
    mutating: true,
    note: "Closes the job with the miles run and anything the dispatcher needs on the record.",
  },
  "assignments:cancel": {
    allow: ["pilot", "dispatcher"],
    mutating: true,
    note: "Either side may walk away from a job they are on. A reason is required and the notice given is recorded.",
  },
  "assignments:no-show": {
    allow: ["dispatcher"],
    mutating: true,
    note: "Records that the pilot never arrived. Only after the pickup window has closed — a no-show is a mark on somebody's record.",
  },
  "assignments:add-proof": {
    allow: ["pilot", "dispatcher"],
    mutating: true,
    note: "Attaches a photo or a note to a job you are on, geotagged from the last position the pilot's device reported rather than from a coordinate the request supplies.",
  },
  "assignments:remove-proof": {
    allow: ["pilot", "dispatcher"],
    mutating: true,
    note: "Removes proof you added yourself. Never the other party's — that is the record they are relying on.",
  },
  "assignments:rate": {
    allow: ["pilot", "dispatcher"],
    mutating: true,
    note: "Rate the other side of a finished job. Once, and it cannot be edited.",
  },

  // ── /api/health ──────────────────────────────────────────────────────────
  "health:detail": {
    allow: ADMIN,
    mutating: false,
    note: "The launch checklist: what is configured and what is not. Administrators only — a health endpoint that lists missing integrations is a map for somebody deciding where to push. The unauthenticated form returns only that the process is answering.",
  },

  // ── /api/notifications ───────────────────────────────────────────────────
  "notifications:GET": {
    allow: SIGNED_IN,
    mutating: false,
    note: "Your own notifications, and a live stream of new ones. The stream is opened for the session's own id, never for one supplied in a parameter.",
  },
  "notifications:mark-read": {
    allow: SIGNED_IN,
    mutating: true,
    note: "Marks your own notifications read. Cannot touch anybody else's.",
  },
  "notifications:push-subscribe": {
    allow: SIGNED_IN,
    mutating: true,
    note: "Registers this browser for push. The endpoint must belong to a known push service — the server posts to it later, so an arbitrary URL would be a request-forgery hole. An endpoint belongs to one account: registering takes it from whoever held it.",
  },
  "notifications:push-register-native": {
    allow: SIGNED_IN,
    mutating: true,
    note: "Registers an installation of the native app for notifications. The token is opaque and is never fetched by this server, so unlike a web endpoint it carries no request-forgery risk. One device belongs to one account: registering takes it from whoever held it.",
  },
  "notifications:push-unsubscribe": {
    allow: SIGNED_IN,
    mutating: true,
    note: "Stops push to one browser. Scoped to the caller, so knowing an endpoint is not a way to silence somebody else's phone.",
  },

  // ── /api/tracking ────────────────────────────────────────────────────────
  "tracking:GET": {
    allow: SIGNED_IN,
    mutating: false,
    note: "The trail on one job, for the pilot and the dispatcher on it. Anybody else is answered 'no such job' so an id cannot be probed.",
  },
  "tracking:ping": {
    allow: ["pilot"],
    mutating: true,
    note: "Positions from the pilot on the job, and only while it is en_route, on_site or escorting (ADR-6). Refused without consent, and refused for a job that is not running.",
  },
  "tracking:consent": {
    allow: ["pilot"],
    mutating: true,
    note: "Agreeing to share location while working, or withdrawing it. Withdrawal stops recording immediately.",
  },

  // ── /api/admin ───────────────────────────────────────────────────────────
  "admin:GET": {
    allow: ADMIN,
    mutating: false,
    note: "The console: marketplace figures, which jobs are running, the audit log, and what has failed to send. Carries no names, phone numbers, addresses or positions — an administrator who needs to see into one job goes through the dispute tool (F-99).",
  },

  "admin:suspend": {
    allow: ADMIN,
    mutating: true,
    note: "Stops an account working immediately: no sign-in, and every session it holds dies. Needs a reason, is audited, and the person is told.",
  },
  "admin:reactivate": {
    allow: ADMIN,
    mutating: true,
    note: "Lifts a suspension. Audited, and the person is told.",
  },
  "admin:revoke-sessions": {
    allow: ADMIN,
    mutating: true,
    note: "Signs somebody out everywhere. Deliberately not a password reset an administrator can complete — that would be a way to become them with nothing on the record.",
  },
  "admin:clear-mfa": {
    allow: ADMIN,
    mutating: true,
    note: "Removes a lost second factor so a new one can be enrolled. Lowers their security, so it needs a reason, drops their sessions, and they are told.",
  },
  "admin:view-as": {
    allow: ADMIN,
    mutating: true,
    note: "A read-only session as somebody else, for 15 minutes. Every mutating action is refused while it is held (see authorize), never for another administrator, and the person being viewed is notified.",
  },

  "admin:settings": {
    allow: ADMIN,
    mutating: true,
    note: "Throws the kill switches and sets the announcement. Audited with what is now closed.",
  },
  "admin:open-dispute": {
    allow: ADMIN,
    mutating: true,
    note: "Opens a dispute on one job. The summary is the reason that permits reading the evidence, so it is required and audited.",
  },
  "admin:resolve-dispute": {
    allow: ADMIN,
    mutating: true,
    note: "Closes a dispute with what was decided. A resolved dispute no longer opens the evidence.",
  },

  // ── /api/messages ────────────────────────────────────────────────────────
  "messages:GET": {
    allow: SIGNED_IN,
    mutating: false,
    note: "The conversation on one job. Membership is checked against the assignment, which names exactly two people — this replaced the trip channel's 'the first two accounts to touch it own it' (F-30).",
  },
  "messages:send": {
    allow: ["pilot", "dispatcher"],
    mutating: true,
    note: "A message on a job you are on. Attachments must be files you uploaded yourself.",
  },
  "messages:report": {
    allow: ["pilot", "dispatcher"],
    mutating: true,
    note: "Reports the other party on a job you are on. The other side is not told: telling somebody they have been reported, before anybody has looked, is how a report becomes the argument.",
  },
  "messages:read": {
    allow: ["pilot", "dispatcher"],
    mutating: true,
    note: "Marks the other side's messages read. Never your own.",
  },

  // ── /api/legal ───────────────────────────────────────────────────────────
  "legal:GET": {
    allow: PUBLIC,
    mutating: false,
    note: "The policies are public. A policy you must create an account to read is not one anybody trusts.",
  },
  "legal:accept": {
    allow: SIGNED_IN,
    mutating: true,
    note: "Records that you accepted the version the server is currently serving, with time and address.",
  },
  "legal:history": {
    allow: SIGNED_IN,
    mutating: false,
    note: "Every published version of one document, so a person can see what changed and when.",
  },
  "legal:publish": {
    allow: ADMIN,
    mutating: true,
    note: "Publishes a new version. Immutable once out, because somebody accepted the last one. Audited.",
  },
  "legal:readiness": {
    allow: ADMIN,
    mutating: false,
    note: "Which policies are still drafts or still carry unfilled placeholders.",
  },
};

/**
 * What an administrator may still reach before enrolling a second factor.
 *
 * Enrolment itself, obviously, and signing out — refusing a sign-out to
 * somebody who cannot get in is a way to strand them.
 */
const MFA_EXEMPT = new Set([
  "auth:GET",
  "auth:logout",
  "auth:mfa-status",
  "auth:mfa-begin",
  "auth:mfa-confirm",
  "profile:GET",
  "billing:GET",
]);

/**
 * What an account being deleted may still do: see its own state, change its
 * mind, take a copy of its data on the way out, and sign out.
 */
const DELETION_EXEMPT = new Set([
  "auth:GET",
  "auth:logout",
  "account:deletion-status",
  "account:cancel-deletion",
  "account:export",
  "legal:GET",
]);

export function policyFor(key: string): Policy | undefined {
  return POLICY[key];
}

/** May this actor call this action? Unknown actions are denied. */
export function isAllowed(key: string, actor: Actor): boolean {
  const policy = POLICY[key];
  if (!policy) return false;
  return policy.allow.includes(actor);
}

/**
 * The refusal a thrown kill switch produces, or null.
 *
 * Exported because `/api/auth` does not route its actions through
 * `authorize` — it gates them in the handler (BACKLOG F-100) — and a switch
 * enforced in two places with two implementations is a switch that will
 * eventually be thrown and do nothing. This is the one implementation; there
 * are two call sites.
 */
export function killSwitchResponse(key: string): Response | null {
  const closed = flagClosing(key, settings());
  if (!closed) return null;
  return Response.json({ error: closed.effect, unavailable: true }, { status: 503 });
}

export type Denial = { response: Response };
export type Granted = { caller: SafeUser | null };

const deny = (message: string, status: number): Denial => ({
  response: Response.json({ error: message }, { status }),
});

/**
 * The origins a browser may legitimately be calling us from.
 *
 * **Behind anything — a CDN, a reverse proxy, a tunnel — the URL this server
 * sees is not the URL the browser used.** cloudflared forwards to
 * `http://127.0.0.1:4300` while the person is on
 * `https://something.example.com`, so comparing the `Origin` header with
 * `request.url` refuses every form post on the site. Found the first time this
 * app was put behind a tunnel, and it is the same on every real host.
 *
 * The fix is to be *told* the public origin rather than to guess it.
 * `X-Forwarded-Host` is the usual guess and it is not safe: any client can
 * send that header, so trusting it would let somebody name our origin for us
 * and defeat the check entirely.
 *
 * The request's own origin stays allowed so that a health check or a call from
 * the machine itself still works. A browser will not send it as an `Origin`
 * for a public site, and a browser is the only thing that sets `Origin` at
 * all.
 */
function allowedOrigins(request: Request): string[] {
  const own = new URL(request.url).origin;
  const configured = process.env.LOADREADY_PUBLIC_ORIGIN?.trim();

  if (!configured) return [own];

  try {
    return [own, new URL(configured).origin];
  } catch {
    console.error(`[authz] LOADREADY_PUBLIC_ORIGIN is not a URL: ${configured}`);
    return [own];
  }
}

/**
 * Cross-site request forgery.
 *
 * The session is a `SameSite=Lax` cookie, which already stops a cross-site form
 * post carrying it. This is the second lock, and it is the one that survives a
 * browser that treats Lax loosely or a future change to `None`: a mutating
 * request must name an origin, and it must be ours.
 *
 * Reads are not checked. A GET that changes nothing is not worth forging, and
 * checking would break a link opened from an email.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const allowed = allowedOrigins(request);

  if (origin) return allowed.includes(origin);

  // No Origin header at all. Browsers always send one on a cross-origin
  // fetch, so this is a non-browser client — curl, a mobile shell, a health
  // check. Falling back to Referer catches the rest.
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return allowed.includes(new URL(referer).origin);
    } catch {
      return false;
    }
  }

  // Nothing to check against. Allowed, because refusing would break every
  // non-browser client, and a request with no Origin is not a forged one — a
  // browser cannot make one. This is the limit of what this control can do.
  return true;
}

/**
 * The single gate.
 *
 * Resolves the caller, checks the matrix, and checks the origin for anything
 * that changes state. Returns either the caller or the response to send.
 */
export async function authorize(request: Request, key: string): Promise<Granted | Denial> {
  const policy = POLICY[key];
  if (!policy) {
    // An action nobody wrote a rule for. Denied, and loudly, because the
    // alternative is a new endpoint that silently lets everyone in.
    console.error(`[authz] no policy for "${key}" — denying`);
    return deny("Not allowed.", 403);
  }

  if (policy.mutating && !sameOrigin(request)) {
    return deny("Request blocked.", 403);
  }

  /*
   * A kill switch closes its keys here, before anything else is checked.
   *
   * In this one place rather than in each route, and driven by the list each
   * flag carries: a switch that has to be remembered in five routes is one
   * that will be forgotten in the sixth. It is checked before the session is
   * resolved, so a closed signup does not first tell somebody they are not
   * signed in.
   */
  const switched = killSwitchResponse(key);
  if (switched) return { response: switched };

  const caller = await userForToken(readSessionCookie(request));

  if (policy.allow.includes("public")) return { caller };
  if (!caller) return deny("Sign in first.", 401);

  /*
   * CLAUDE.md requires a second factor on the admin role. An administrator who
   * has not enrolled can sign in and reach the enrolment screen, and nothing
   * else — enforced here rather than in the console, so it holds for a direct
   * call to the API as well as for a click.
   */
  if (!MFA_EXEMPT.has(key) && (await adminNeedsMfa(caller))) {
    return {
      response: Response.json(
        {
          error: "Set up two-factor sign-in before using the admin console.",
          mfaSetupRequired: true,
        },
        { status: 403 },
      ),
    };
  }

  /*
   * An administrator looking at somebody else's account may look and nothing
   * more.
   *
   * This is the whole safety of view-as, and it lives here because this is the
   * one place every mutating action passes through. Enforcing it per route
   * would mean one forgotten route is a way for an administrator to act as a
   * user with the user's name on it.
   */
  if (policy.mutating && (await impersonationOf(readSessionCookie(request)))) {
    return {
      response: Response.json(
        {
          error: "You are viewing this account. Nothing can be changed from here.",
          viewingAs: true,
        },
        { status: 403 },
      ),
    };
  }

  /*
   * An account inside its deletion grace period can sign in, and reach nothing
   * but the screen offering to change its mind. Enforced on the server so it
   * holds for a direct API call, not only for a click.
   */
  if (!DELETION_EXEMPT.has(key) && caller.deletionRequestedAt) {
    return {
      response: Response.json(
        { error: "This account is scheduled for deletion.", deletionPending: true },
        { status: 403 },
      ),
    };
  }

  if (!policy.allow.includes(caller.role)) {
    // Deliberately the same wording whoever is refused, so the message does not
    // teach an attacker which role would have worked.
    return deny("Not allowed.", 403);
  }

  return { caller };
}

export function isDenied(result: Granted | Denial): result is Denial {
  return "response" in result;
}
