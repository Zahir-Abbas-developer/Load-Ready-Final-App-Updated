/**
 * The assignment state machine.
 *
 * From the moment a pilot is hired to the moment the job is done, the
 * assignment moves through five states. Each one is somebody asserting a fact
 * about the world — "I am on the road", "I am at the yard" — so the rules here
 * are about **who is in a position to know**:
 *
 * - **Only the pilot moves it forward.** A dispatcher sitting in an office who
 *   could mark a job "on site" would be recording something they cannot see.
 * - **No skipping.** Every step is a separate fact. Jumping from `assigned` to
 *   `escorting` would leave no record of when the pilot actually arrived, which
 *   is the number that settles a detention argument.
 * - **No going back.** The trail is a record, and a record that can be rewound
 *   is not one. A wrong tap is a dispute for an administrator to correct with
 *   an audit entry, not a button on the driver's phone (BACKLOG F-86).
 * - **Either side can cancel, with a reason, and how much notice they gave is
 *   recorded** — because "cancelled" alone tells a pilot who cleared their week
 *   nothing, and a pattern of two-hour cancellations is something the other
 *   side deserves to be able to point at.
 *
 * Pure, so every transition — legal and illegal — can be tested.
 */
import type { Assignment, AssignmentStatus } from "./offers";

/** The order the job actually happens in. */
export const ASSIGNMENT_FLOW: AssignmentStatus[] = [
  "assigned",
  "en_route",
  "on_site",
  "escorting",
  "completed",
];

/** Nothing moves out of these. */
export const TERMINAL: AssignmentStatus[] = ["completed", "cancelled"];

export type Mover = "pilot" | "dispatcher" | "admin";

export interface TransitionRule {
  from: AssignmentStatus;
  to: AssignmentStatus;
  /** Who may make this move. */
  by: Mover[];
  /** What the mover is asserting, in their words. */
  label: string;
  /** Why only they may say it. Read by the review, not by the code. */
  note: string;
}

/**
 * Every legal move, as data.
 *
 * Same shape as the authorization matrix: the rules are a table you can read
 * top to bottom, and the tests walk it rather than restating it.
 */
export const TRANSITIONS: TransitionRule[] = [
  {
    from: "assigned",
    to: "en_route",
    by: ["pilot"],
    label: "I'm on my way",
    note: "The pilot has set off. Only they know when.",
  },
  {
    from: "en_route",
    to: "on_site",
    by: ["pilot"],
    label: "I've arrived",
    note: "At the yard. This is the timestamp a detention argument turns on, so it comes from the person standing there.",
  },
  {
    from: "on_site",
    to: "escorting",
    by: ["pilot"],
    label: "We're rolling",
    note: "The load is moving with the escort in place.",
  },
  {
    from: "escorting",
    to: "completed",
    by: ["pilot"],
    label: "Job finished",
    note: "Delivered. The pilot closes it with the miles they ran and anything the dispatcher needs to know.",
  },
];

export interface TransitionCheck {
  ok: boolean;
  /** Shown to whoever tried. */
  reason?: string;
}

const LABELS: Record<AssignmentStatus, string> = {
  assigned: "Assigned",
  en_route: "On the way",
  on_site: "At the pickup",
  escorting: "Escorting",
  completed: "Finished",
  cancelled: "Cancelled",
};

export const statusLabel = (s: AssignmentStatus): string => LABELS[s] ?? s;

/** The next step in the flow, or null at the end of it. */
export function nextStatus(current: AssignmentStatus): AssignmentStatus | null {
  const i = ASSIGNMENT_FLOW.indexOf(current);
  if (i < 0 || i >= ASSIGNMENT_FLOW.length - 1) return null;
  return ASSIGNMENT_FLOW[i + 1];
}

/** The rule for one move, or null when there is no such move. */
export function ruleFor(from: AssignmentStatus, to: AssignmentStatus): TransitionRule | null {
  return TRANSITIONS.find((t) => t.from === from && t.to === to) ?? null;
}

/**
 * Whether this person may make this move right now.
 *
 * Refusals say which of the three things went wrong — the job is over, the move
 * is not a real one, or it is not theirs to make — because "no" on its own
 * sends somebody looking in the wrong place.
 */
export function canAdvance(
  from: AssignmentStatus,
  to: AssignmentStatus,
  by: Mover,
): TransitionCheck {
  if (TERMINAL.includes(from)) {
    return {
      ok: false,
      reason:
        from === "cancelled"
          ? "This job was cancelled."
          : "This job is finished. Ask support if something needs correcting.",
    };
  }

  const rule = ruleFor(from, to);
  if (!rule) {
    const expected = nextStatus(from);
    return {
      ok: false,
      reason: expected
        ? `The next step is "${statusLabel(expected)}".`
        : "That is not a step this job can take.",
    };
  }

  if (!rule.by.includes(by)) {
    return {
      ok: false,
      reason: "Only the pilot on this job can move it forward.",
    };
  }

  return { ok: true };
}

// ── cancelling ─────────────────────────────────────────────────────────────

/** Under this much notice, a cancellation is worth both sides being able to see. */
export const LATE_CANCELLATION_HOURS = 24;

/**
 * How much warning a cancellation gives, in whole hours before the pickup.
 *
 * Negative once the window has opened — a job cancelled while the pilot is
 * already at the yard is a different thing from one cancelled a week out, and
 * the record should be able to tell them apart.
 */
export function noticeHours(pickupFrom: string, now = Date.now()): number | null {
  const start = Date.parse(pickupFrom);
  if (!Number.isFinite(start)) return null;
  return Math.floor((start - now) / 3_600_000);
}

export const isLateCancellation = (hours: number | null): boolean =>
  hours !== null && hours < LATE_CANCELLATION_HOURS;

/**
 * Whether a dispatcher may record a no-show.
 *
 * Only from `assigned`, and only once the pickup window has closed. Before
 * that the pilot is not late, they are expected — and a no-show is a mark on
 * somebody's record, so it should not be possible to leave one by being
 * impatient.
 */
export function canMarkNoShow(
  assignment: Pick<Assignment, "status">,
  pickupTo: string,
  now = Date.now(),
): TransitionCheck {
  if (assignment.status !== "assigned") {
    return {
      ok: false,
      reason:
        assignment.status === "cancelled"
          ? "This job was already cancelled."
          : "This pilot has already started the job.",
    };
  }

  const closes = Date.parse(pickupTo);
  if (!Number.isFinite(closes)) {
    return { ok: false, reason: "This load has no pickup window to measure against." };
  }
  if (now < closes) {
    return { ok: false, reason: "The pickup window has not closed yet." };
  }

  return { ok: true };
}

// ── what the load says, derived from its assignments ───────────────────────

export type DerivedWork = "not_started" | "in_progress" | "completed";

/**
 * Where a load is, read from the jobs on it.
 *
 * Derived rather than stored, for the same reason offer expiry is: a load whose
 * escorts are all finished but whose own row still says "filled" is a lie the
 * dispatcher has to work around.
 */
export function deriveWork(assignments: Array<Pick<Assignment, "status">>): DerivedWork {
  const live = assignments.filter((a) => a.status !== "cancelled");
  if (live.length === 0) return "not_started";
  if (live.every((a) => a.status === "completed")) return "completed";
  if (live.some((a) => a.status !== "assigned")) return "in_progress";
  return "not_started";
}

// ── completion ─────────────────────────────────────────────────────────────

/** A sanity bound on the odometer, not a business rule. */
export const MAX_MILES = 5000;

export function checkCompletion(input: { milesDriven?: number | null }): TransitionCheck {
  const miles = input.milesDriven;
  if (miles === null || miles === undefined) return { ok: true };
  if (!Number.isFinite(miles) || miles < 0 || miles > MAX_MILES) {
    return { ok: false, reason: `Miles has to be a number between 0 and ${MAX_MILES}.` };
  }
  return { ok: true };
}
