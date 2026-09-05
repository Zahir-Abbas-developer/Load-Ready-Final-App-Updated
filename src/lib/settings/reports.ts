/**
 * Why somebody would report the other party on a job.
 *
 * Shared between the report sheet and the console's queue, so the two cannot
 * drift into calling the same thing different names.
 */
export const REPORT_REASONS = {
  abusive: "Abusive or threatening",
  "off-platform": "Trying to take the job off LoadReady",
  safety: "A safety problem on the job",
  other: "Something else",
} as const;

export type ReportReason = keyof typeof REPORT_REASONS;

export const REPORT_REASON_IDS = Object.keys(REPORT_REASONS) as ReportReason[];
