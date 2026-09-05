/**
 * The legal document set, its versions, and what is still missing from it.
 *
 * Two facts have to be filled in before any of this is a contract: the legal
 * entity that is party to it, and the law it is governed by. Neither is known.
 * loadready.ai/terms is live today and carries `[LEGAL ENTITY NAME TO BE
 * CONFIRMED]` and `[GOVERNING STATE OR JURISDICTION TO BE CONFIRMED]` in the
 * published text, so the website does not answer it either.
 *
 * That shapes everything here. The placeholders are **named**, tracked, and
 * shown to the reader rather than quietly rendered — an agreement with a blank
 * where one party's name should be is not an agreement, and a user who accepts
 * one has agreed with nobody. Acceptances are still recorded against the
 * version, so when the real text is published the re-acceptance flow has
 * something to compare against.
 */

export type LegalDocumentKind =
  | "terms-of-service"
  | "privacy-policy"
  | "subscription-terms"
  | "pilot-operator-agreement"
  | "dispatcher-company-agreement";

export interface LegalDocumentMeta {
  kind: LegalDocumentKind;
  title: string;
  /** One line, for the list and the footer. */
  summary: string;
  /** Who has to accept it, and when. */
  appliesTo: Array<"pilot" | "dispatcher">;
  /** Accepted at signup, or later in the funnel. */
  acceptedAt: "signup" | "onboarding";
}

export const LEGAL_DOCUMENTS: LegalDocumentMeta[] = [
  {
    kind: "terms-of-service",
    title: "Terms of Service",
    summary: "The rules for using LoadReady.",
    appliesTo: ["pilot", "dispatcher"],
    acceptedAt: "signup",
  },
  {
    kind: "privacy-policy",
    title: "Privacy Policy",
    summary: "What we collect, why, and what you can ask us to do about it.",
    appliesTo: ["pilot", "dispatcher"],
    acceptedAt: "signup",
  },
  {
    kind: "subscription-terms",
    title: "Subscription Terms",
    summary: "Price, billing, trial, auto-renewal and how to cancel. Pilots only.",
    appliesTo: ["pilot"],
    acceptedAt: "onboarding",
  },
  {
    kind: "pilot-operator-agreement",
    title: "Pilot Operator Agreement",
    summary: "What a pilot car operator undertakes when accepting escort work.",
    appliesTo: ["pilot"],
    acceptedAt: "onboarding",
  },
  {
    kind: "dispatcher-company-agreement",
    title: "Company Agreement",
    summary: "What a dispatching company undertakes when posting a load.",
    appliesTo: ["dispatcher"],
    acceptedAt: "onboarding",
  },
];

export function documentMeta(kind: string): LegalDocumentMeta | undefined {
  return LEGAL_DOCUMENTS.find((d) => d.kind === kind);
}

export const isLegalKind = (kind: string): kind is LegalDocumentKind =>
  LEGAL_DOCUMENTS.some((d) => d.kind === kind);

// ── the blanks ─────────────────────────────────────────────────────────────

/**
 * Every fact a published policy needs and nobody has supplied.
 *
 * Written as tokens so a document can be scanned for them mechanically. The
 * app refuses to describe a document as final while any of these survive in its
 * body, which is the check the live site does not have.
 */
export const PLACEHOLDERS = {
  entity: "{{LEGAL_ENTITY}}",
  jurisdiction: "{{GOVERNING_LAW}}",
  disputes: "{{DISPUTE_RESOLUTION}}",
} as const;

export const PLACEHOLDER_TOKENS = Object.values(PLACEHOLDERS);

/** Which blanks a body still has. Empty means it is fillable and complete. */
export function unresolvedPlaceholders(body: string): string[] {
  const found = PLACEHOLDER_TOKENS.filter((token) => body.includes(token));

  // The live site uses square-bracket prose rather than tokens. Catching that
  // shape too means text pasted straight from loadready.ai is checked as well.
  const bracketed = body.match(/\[[A-Z][A-Z \-/]{8,}\]/g) ?? [];
  return [...new Set([...found, ...bracketed])];
}

export const isFinalisable = (body: string) => unresolvedPlaceholders(body).length === 0;

// ── the company, as far as it is known ─────────────────────────────────────

/**
 * Taken from loadready.ai on 30 August 2026, not from anywhere authoritative.
 *
 * An address on a website is not a registered office and a trading name is not
 * a legal entity. These are here so the drafts carry real contact details
 * instead of invented ones; they are not a substitute for the two blanks above.
 */
export const COMPANY = {
  tradingName: "LoadReady",
  address: "515 East Las Olas Blvd, Suite 300, Fort Lauderdale, FL 33301",
  phone: "+1 754 778 9315",
  support: "support@loadready.ai",
  privacy: "privacy@loadready.ai",
  security: "security@loadready.ai",
} as const;
