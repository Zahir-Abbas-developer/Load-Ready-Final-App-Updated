/**
 * The switches an administrator can throw without a deploy.
 *
 * Deliberately short. A setting nothing reads is a lie with a toggle on it,
 * and this project has spent several phases deleting exactly that — so the
 * plan's "trial days", "default search radius" and "notification templates"
 * are **not** here: nothing in the product consumes them, and a screen that
 * pretended otherwise would be the fourth fake control I have removed.
 *
 * What is here is enforced. Each kill switch names the authorization keys it
 * closes, so throwing it cannot miss a route somebody added later.
 */

export type FlagId = "signups" | "loadPosting" | "tracking";

export interface FlagDefinition {
  label: string;
  /** What stops working, in the words the person affected would hear. */
  effect: string;
  /** Why you would ever throw it. */
  when: string;
  /**
   * The authorization keys this closes.
   *
   * Listed here rather than checked in each route: a switch that has to be
   * remembered in five places is one that will be forgotten in the sixth.
   */
  closes: string[];
}

export const FLAGS: Record<FlagId, FlagDefinition> = {
  signups: {
    label: "New signups",
    effect: "Nobody can create an account. Everyone who has one is unaffected.",
    when: "A wave of fake accounts, or you need the verification queue to stop growing.",
    closes: ["auth:signup", "auth:verify-otp", "auth:resend-otp"],
  },
  loadPosting: {
    label: "Posting loads",
    effect:
      "Dispatchers cannot create or publish loads. Everything already posted carries on, and hiring still works.",
    when: "Something is wrong with matching or notifications and you want to stop the bleeding.",
    closes: ["loads:create", "loads:update", "loads:publish"],
  },
  tracking: {
    label: "Location sharing",
    effect:
      "No position is recorded from anybody. Jobs still run; the live map stops updating and says so.",
    when: "A privacy incident, or a bug writing positions where it should not.",
    closes: ["tracking:ping"],
  },
};

export interface Settings {
  /** A flag being **on** means the feature works. Off is the kill. */
  flags: Record<FlagId, boolean>;
  /**
   * A line shown to everybody, everywhere.
   *
   * For "we are down until nine" and nothing else. Empty means no banner —
   * there is no way to show one that says nothing.
   */
  announcement: string;
  updatedAt: string;
  updatedBy: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  flags: { signups: true, loadPosting: true, tracking: true },
  announcement: "",
  updatedAt: new Date(0).toISOString(),
  updatedBy: null,
};

export const FLAG_IDS = Object.keys(FLAGS) as FlagId[];

export const isFlagId = (value: string): value is FlagId => FLAG_IDS.includes(value as FlagId);

/**
 * Which flag, if any, closes this authorization key.
 *
 * Used by `authorize`, so a route added later is covered the moment its key is
 * listed above — and is not covered silently if it is not.
 */
export function flagClosing(key: string, settings: Settings): FlagDefinition | null {
  for (const id of FLAG_IDS) {
    if (settings.flags[id] === false && FLAGS[id].closes.includes(key)) return FLAGS[id];
  }
  return null;
}

/** The maximum an announcement may be. Long enough to say what is wrong. */
export const MAX_ANNOUNCEMENT = 280;
