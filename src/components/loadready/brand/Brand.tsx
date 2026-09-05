/**
 * The LoadReady mark and wordmark.
 *
 * Replaces `src/assets/loadready-logo.png`, which was the **previous brand's
 * letter B**. The file had been renamed during the de-branding in Phase B1 but
 * the artwork inside it never was, so the old company's initial was still on
 * the splash screen, the top bar, the sign-in screen, the home header, the
 * administrator console — and, since K1, on every app icon and the favicon.
 *
 * Drawn rather than photographed, for reasons that matter at these sizes:
 *
 * - It is sharp at 10px in the home header and at 160px on the splash, from
 *   one definition. The PNG was a fixed 1024 square being scaled down to ten
 *   pixels in one place.
 * - It takes its colour from the surrounding text, so it works on the gold
 *   splash, on white, and on a dark header without three separate files.
 * - There is nothing to regenerate when the palette moves, which it did in L2
 *   and again now.
 */

/**
 * The square mark: an L and an R sharing a stem.
 *
 * Geometric rather than typographic on purpose — a letterform from the body
 * font shrinks badly, and this has to survive being a favicon.
 */
export function LoadReadyMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="LoadReady"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/*
       * The road the escort runs: a rounded plate so the mark reads as one
       * object at small sizes instead of two loose letters.
       */}
      <rect width="64" height="64" rx="15" className="fill-primary" />

      {/* L */}
      <path
        d="M17 16v26a2 2 0 0 0 2 2h11"
        className="stroke-primary-foreground"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* R — bowl and leg, sharing the L's baseline. */}
      <path
        d="M36 44V20h7a7 7 0 0 1 0 14h-7m7 0 6 10"
        className="stroke-primary-foreground"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The name, set properly.
 *
 * One weight with tight tracking rather than two weights or two colours: the
 * product is sold to dispatchers and drivers, and a wordmark that looks like a
 * consumer app undersells it. `Load` and `Ready` are one word here — the
 * capital R does the separating, which is what the name is for.
 */
export function LoadReadyWordmark({
  className = "text-2xl",
  withMark = true,
}: {
  className?: string;
  withMark?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      {withMark && <LoadReadyMark className="h-[1.15em] w-[1.15em] shrink-0" />}
      <span className="font-bold tracking-tight whitespace-nowrap">LoadReady</span>
    </span>
  );
}
