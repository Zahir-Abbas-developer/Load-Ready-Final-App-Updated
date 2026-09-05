/**
 * How far the load is going.
 *
 * The dispatcher used to type this by hand. It is worth working out for them —
 * but **what kind of number it is matters more than having one**, because the
 * field sits under a per-mile rate and a pilot prices a run off it.
 *
 * A straight line between two cities is not a drive. Houston to Shreveport is
 * 214 miles as the crow flies and about 235 by road — ten per cent, which on a
 * long run at a per-mile rate is real money. Routes that bend around water, a
 * mountain or a permit restriction are far worse than ten. So this never
 * presents the two as the same thing.
 *
 * Pure, so the arithmetic and the honesty rule can both be tested.
 */

/** Where the number came from, and therefore how much it can be trusted. */
export type DistanceKind =
  /** A real route along real roads. Safe to put in the field. */
  | "driving"
  /** A line between two points. An underestimate, always. Needs a human. */
  | "straight-line";

export interface DistanceEstimate {
  miles: number;
  kind: DistanceKind;
  /** What produced it, for the line under the field. */
  provider: string;
}

export interface Point {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_MI = 3958.7613;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance. The floor of any road distance, never the answer. */
export function straightLineMiles(from: Point, to: Point): number {
  const dLat = rad(to.lat - from.lat);
  const dLng = rad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Miles are whole numbers here.
 *
 * A permit route is not measured to the yard, and "231.847 mi" in a field that
 * feeds a price implies a precision nothing behind it has.
 */
export const roundMiles = (miles: number): number => Math.max(0, Math.round(miles));

/**
 * Whether a number may be dropped into the field without being asked about.
 *
 * Only a real driving distance. A straight line is offered as a suggestion the
 * dispatcher has to accept, because accepting it is the moment they see what
 * kind of number it is — and silently filling the field is how somebody prices
 * a thousand-mile run short and finds out at the end of it.
 */
export const canFillAutomatically = (kind: DistanceKind): boolean => kind === "driving";

/** What to say under the field, in a sentence a dispatcher can act on. */
export function distanceNote(estimate: DistanceEstimate): string {
  return estimate.kind === "driving"
    ? `Driving distance, worked out from the two cities (${estimate.provider}).`
    : `Straight-line distance (${estimate.provider}) — the road will be longer. Check it before pricing per mile.`;
}
