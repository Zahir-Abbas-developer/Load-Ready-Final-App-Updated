/**
 * Where people stop.
 *
 * A marketplace does not grow by being watched in aggregate; it grows by
 * somebody noticing that eleven pilots signed up, nine were approved, and one
 * ever bid on anything. The console already reports totals (J1). Totals do not
 * answer where the drop is.
 *
 * Pure, so the arithmetic and — more importantly — the honesty rule can be
 * tested against numbers rather than against a live store.
 *
 * **The honesty rule.** A percentage of four people is not a percentage, it is
 * a coincidence with a decimal point. Below `MIN_SAMPLE` the rate is `null` and
 * the screen says how many are needed, rather than printing "25%" and letting
 * somebody plan around it. The same reasoning as PH-58: a figure that cannot
 * be computed honestly is shown as nothing, never as zero.
 */

/** Below this, a conversion rate says more about chance than about product. */
export const MIN_SAMPLE = 20;

export interface Stage {
  /** What happened, in the past tense, from the person's side. */
  name: string;
  /** How many people have reached this stage. */
  count: number;
  /**
   * The share of the previous stage that got here. `null` when the previous
   * stage is too small to divide honestly, and when this is the first stage.
   */
  rate: number | null;
  /** How many did not get from the previous stage to this one. */
  lost: number;
  /** Set when the rate is withheld, so the screen can say why. */
  tooFewFor?: number;
}

/**
 * Turns a list of counts into stages with drop-off between them.
 *
 * Counts must be cumulative and non-increasing — everybody who was hired also
 * signed up. If a later stage exceeds an earlier one the data is wrong rather
 * than the arithmetic, and it is reported as it is rather than clamped: a
 * funnel that quietly tidies up an impossible number hides the bug that
 * produced it.
 */
export function funnel(stages: Array<{ name: string; count: number }>): Stage[] {
  return stages.map((stage, i) => {
    if (i === 0) {
      return { name: stage.name, count: stage.count, rate: null, lost: 0 };
    }

    const previous = stages[i - 1].count;
    const lost = previous - stage.count;

    if (previous < MIN_SAMPLE) {
      return { name: stage.name, count: stage.count, rate: null, lost, tooFewFor: MIN_SAMPLE };
    }

    return {
      name: stage.name,
      count: stage.count,
      rate: previous === 0 ? null : stage.count / previous,
      lost,
    };
  });
}

/**
 * The stage that loses the most people, when there is enough to say so.
 *
 * The one thing a founder wants from this screen: where to spend the week.
 * Returns null rather than guessing when every stage is below the sample size,
 * because pointing at the biggest of four small numbers is worse than saying
 * nothing.
 */
export function worstStage(stages: Stage[]): Stage | null {
  const measurable = stages.filter((s) => s.rate !== null && s.lost > 0);
  if (measurable.length === 0) return null;

  return measurable.reduce((worst, s) => (s.rate! < worst.rate! ? s : worst));
}
