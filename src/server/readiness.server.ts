/**
 * The launch checklist, for the running server.
 *
 * Thin on purpose: the checks themselves are pure and live in
 * `src/lib/launch/checks.ts`, so the same code answers for this server, for
 * `npm run preflight`, and for a test that fabricates a half-finished host.
 *
 * The one thing that could go wrong with that arrangement is drift — the pure
 * checks reading one variable while the module that uses it reads another —
 * so `tests/launch.test.ts` asserts the two agree rather than trusting them to.
 *
 * Never import this from client code.
 */
import { launchChecks, summarise, type Readiness } from "@/lib/launch/checks";

export type { Check, Readiness, Severity } from "@/lib/launch/checks";

export function readiness(): Readiness {
  return summarise(launchChecks(process.env));
}
