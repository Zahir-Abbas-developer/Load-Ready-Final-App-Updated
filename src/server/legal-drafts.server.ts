/**
 * The seeded drafts.
 *
 * These exist so the machinery — publishing, versioning, acceptance,
 * re-acceptance — can be built and tested against something. They are **not**
 * legal text and they say so on their own first line. The plan is explicit:
 * load clearly labelled drafts, do not invent legal language beyond a draft
 * marker, and wait for texts that a lawyer has seen.
 *
 * So each one below states what the document is *for*, lists what a real
 * version has to say, and leaves the two unfilled facts as tokens. That is
 * useful to a founder taking this to a lawyer — it is the brief — and it is
 * useless as a contract, which is the honest state of affairs.
 *
 * The founder replaces each of these by pasting the real text into
 * Admin → Legal. Nothing here has to be edited in code.
 */
import { COMPANY, PLACEHOLDERS, type LegalDocumentKind } from "@/lib/legal/documents";

const MARKER = `> **DRAFT — NOT A LEGAL DOCUMENT.** This is a placeholder so the app can be
> built and tested. It has not been written or reviewed by a lawyer, and it is
> not binding on anyone. Replace it in Admin → Legal before launch.`;

const CONTACT = `**LoadReady**
${COMPANY.address}
${COMPANY.phone}
${COMPANY.support}`;

export const DRAFTS: Record<LegalDocumentKind, string> = {
  "terms-of-service": `${MARKER}

# Terms of Service

**Parties.** These terms are between ${PLACEHOLDERS.entity} and you.

**Governed by.** ${PLACEHOLDERS.jurisdiction}

**Disputes.** ${PLACEHOLDERS.disputes}

## What a finished version has to cover

- Who may open an account, and that administrators are never self-service.
- What LoadReady does and, more importantly, what it does not: **we introduce
  dispatchers to pilot car operators. We are not a party to the escort job, we
  do not employ pilots, and we do not handle payment for the work.** The money
  for a job moves between the dispatcher and the pilot directly.
- That a pilot is an independent contractor of the dispatcher, not of LoadReady.
- Accuracy of the credentials a pilot uploads, and the consequences of a false
  one.
- Acceptable use, suspension and termination.
- Limitation of liability and indemnity — the clauses that most need a lawyer,
  given that the product coordinates vehicles on public roads.
- Insurance: whose covers what, and that LoadReady's does not cover the escort.
- How the terms change, and how you are told.

${CONTACT}`,

  "privacy-policy": `${MARKER}

# Privacy Policy

**Controller.** ${PLACEHOLDERS.entity}

## What a finished version has to cover

The exact inventory is in \`docs/PRIVACY_DISCLOSURES.md\`, derived from the code
rather than from memory. The three that need the most care:

- **Precise location.** A pilot's position is collected during an active
  assignment and is visible to the dispatcher on that job. It is the most
  sensitive thing here after the documents, and a policy that calls it
  "location information" without saying *precise*, *during a job*, and *to
  whom* is not describing what the app does.
- **Identity documents.** Driving licences, insurance certificates and medical
  cards are uploaded and reviewed by LoadReady administrators.
- **Payment data.** Pilots pay a subscription. Card details go to the payment
  provider and never to us — but that has to be said, not implied.

Also required: retention periods with actual durations, named subprocessors,
and the rights available under Californian and Canadian law, since the product
launches in the USA and Canada.

Privacy requests: ${COMPANY.privacy}
Security reports: ${COMPANY.security}

${CONTACT}`,

  "subscription-terms": `${MARKER}

# Subscription Terms

Applies to pilot car operators. **Dispatchers are never charged.**

## What a finished version has to cover

- The price, the billing period, and that it renews automatically until
  cancelled. The figures come from the payment provider, not from this text.
- The free trial: how long, that a card is required, and that cancelling before
  it ends means no charge.
- How to cancel, that cancelling takes effect at the end of the paid period, and
  what happens after — browsing continues, bidding and accepting stop.
- What happens when a payment fails, and how long access continues while it is
  fixed.
- Refunds. Required by both app stores and by Stripe.
- That a subscription bought inside the iOS or Android app is governed by that
  store's terms and cancelled through that store, not through us.
- Price changes and the notice given.

${CONTACT}`,

  "pilot-operator-agreement": `${MARKER}

# Pilot Operator Agreement

Accepted by a pilot car operator before their first assignment.

## What a finished version has to cover

- That the operator holds, and will keep current, every certification,
  insurance policy and licence required in each region they work.
- That they will tell LoadReady when one lapses, is suspended or is revoked.
- That the equipment recorded on their profile is equipment they actually carry.
- Their obligations on an active escort: following the approved route, the
  permit's restrictions, and applicable traffic law.
- That the dispatcher, not LoadReady, is who they contract with for the job.
- What they may do with a dispatcher's contact details and load information,
  and that soliciting outside the platform during an assignment is not that.

${CONTACT}`,

  "dispatcher-company-agreement": `${MARKER}

# Company Agreement

Accepted by a dispatching company before posting its first load.

## What a finished version has to cover

- That the person accepting has authority to bind the company.
- That the load details, dimensions, weight and permit information they post are
  accurate — a pilot accepts work on the strength of them.
- That they hold the permits the route requires.
- That they pay the pilot directly, on the terms they agreed, and that
  **LoadReady is not a party to that payment and does not guarantee it.**
- What they may do with a pilot's details once assigned.
- That posting loads is free, and that this does not change.

${CONTACT}`,
};
