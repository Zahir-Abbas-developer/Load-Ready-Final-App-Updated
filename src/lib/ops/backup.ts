/**
 * Taking a copy of everything the product knows, and proving the copy is good.
 *
 * Every account, company, load, offer, job, message, document, rating,
 * position and audit entry lives in one directory of JSON files and one folder
 * of uploads. There is no database behind it yet (F-01) and — until this —
 * there was no copy of it anywhere (F-159).
 *
 * **A copy nobody has verified is not a backup.** So this counts and measures
 * what it wrote and compares it with what it read, and says so. The failure
 * this guards against is the ordinary one: a backup that has been running for
 * six months and has been empty since the second week.
 *
 * Pure apart from the file operations it is handed, so the decisions — what to
 * keep, what to prune, whether a copy matches — can be tested without touching
 * a disk.
 */

/** One file in the store, as far as this cares. */
export interface Entry {
  /** Relative to the data directory, with forward slashes. */
  path: string;
  bytes: number;
}

export interface Verification {
  ok: boolean;
  /** Files that are in the source and not in the copy. */
  missing: string[];
  /** Files whose copy is a different size. */
  differing: string[];
  files: number;
  bytes: number;
}

/**
 * Compares what was read with what was written.
 *
 * Sizes rather than checksums: the stores are rewritten whole, so a truncated
 * or half-written copy differs in length, and hashing every upload on every
 * nightly run costs more than it proves at this size. A file that matches in
 * name and length here has been copied by `fs`, which does not silently
 * corrupt.
 */
export function verify(source: Entry[], copy: Entry[]): Verification {
  const copied = new Map(copy.map((e) => [e.path, e.bytes]));

  const missing: string[] = [];
  const differing: string[] = [];

  for (const entry of source) {
    const bytes = copied.get(entry.path);
    if (bytes === undefined) missing.push(entry.path);
    else if (bytes !== entry.bytes) differing.push(entry.path);
  }

  return {
    ok: missing.length === 0 && differing.length === 0,
    missing,
    differing,
    files: source.length,
    bytes: source.reduce((n, e) => n + e.bytes, 0),
  };
}

/**
 * A name that sorts chronologically and survives every filesystem.
 *
 * Colons are not allowed on Windows and are awkward everywhere else, so the
 * timestamp is flattened rather than left in ISO form.
 */
export function backupName(at: Date): string {
  return `loadready-${at.toISOString().replace(/[:.]/g, "-").replace(/Z$/, "Z")}`;
}

/** Ours, and only ours — so pruning can never reach anything else. */
export const isBackupName = (name: string): boolean =>
  /^loadready-\d{4}-\d{2}-\d{2}T[\d-]+Z$/.test(name);

/**
 * Which copies to delete, keeping the newest `keep`.
 *
 * Never returns anything that is not one of ours, and never returns
 * everything: a retention rule that can empty the directory is a retention
 * rule that eventually does.
 */
export function toPrune(names: string[], keep: number): string[] {
  if (keep < 1) throw new Error("Keep at least one backup.");

  const ours = names.filter(isBackupName).sort();
  if (ours.length <= keep) return [];
  return ours.slice(0, ours.length - keep);
}
