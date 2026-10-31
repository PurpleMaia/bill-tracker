// PURE governor-stage contact helpers — no DB, no network. Once a bill reaches
// the Governor (transmitted, or on the intent-to-veto list) legislators can no
// longer act on it; the actionable contact is the Governor's office itself.
// After a FINAL veto the Governor is done and only a legislative override can
// save the bill, so the contact flips back to legislators.
import { measurePhrase, NAME_PLACEHOLDER } from '@/lib/legislators/contact-script';
import type { ParsedConferee } from '@/lib/testimony/conferees';

/** The Governor's "Comments on Legislation" form — feedback on a specific measure. */
export const GOVERNOR_COMMENTS_URL = 'https://governor.hawaii.gov/comments-on-legislation/';

/** The Governor's general contact form — a personal message to the Governor. */
export const GOVERNOR_CONTACT_URL = 'https://governor.hawaii.gov/contact-us/contact-the-governor/';

/** Office of the Governor main line (governor.hawaii.gov general contact information). */
export const GOVERNOR_PHONE = '(808) 586-0034';

/** Greeting for the Governor scripts. No name — it survives a change of administration. */
export const GOVERNOR_GREETING = 'Dear Governor,';

/** The two contact routes, in display order. Shared by the briefing and the contact page. */
export const GOVERNOR_CONTACT_OPTIONS = [
  { label: 'commenting on this legislation', href: GOVERNOR_COMMENTS_URL },
  { label: 'contacting the Governor directly', href: GOVERNOR_CONTACT_URL },
] as const;

/**
 * Where a bill sits in the governor phase:
 * - `awaitingGovernor` — transmitted; the Governor can sign, veto, or let it pass.
 * - `intentToVeto`     — on the intent-to-veto list; the Governor can still relent.
 * - `vetoed`           — final veto; only a legislative override can save it.
 */
export type GovernorStage = 'awaitingGovernor' | 'intentToVeto' | 'vetoed';

/** True at the governor-phase statuses (`transmittedGovernor`, `vetoList`). */
export function isGovernorStatus(status: string | null | undefined): boolean {
  return status === 'transmittedGovernor' || status === 'vetoList';
}

// A final veto prints as "Vetoed (Gov. Msg. No. 1369)." or "Vetoed on 07/15/2026
// - Returned from the Governor without approval…"; the intent notice is "Notice
// of intent to veto…", which doesn't start with "Vetoed".
const FINAL_VETO_RE = /^\s*vetoed\b/i;

/**
 * The governor-phase stage for a bill, or null outside it. `vetoList` covers
 * both the intent-to-veto list and a final veto — the status history tells them
 * apart.
 */
export function getGovernorStage(
  status: string | null | undefined,
  updates: ReadonlyArray<{ statustext: string }> | null | undefined,
): GovernorStage | null {
  if (status === 'transmittedGovernor') return 'awaitingGovernor';
  if (status !== 'vetoList') return null;
  return (updates ?? []).some((u) => FINAL_VETO_RE.test(u.statustext)) ? 'vetoed' : 'intentToVeto';
}

/**
 * The shared, editable written message to the Governor — pasted into either
 * governor.hawaii.gov form (there is no public email address). On the
 * intent-to-veto list the ask is to reconsider; otherwise it's to sign.
 */
export function buildGovernorBaseScript(input: {
  billNumber: string;
  billTitle: string | null;
  intentToVeto: boolean;
  userName?: string;
}): { subject: string; body: string } {
  const { billNumber, billTitle, intentToVeto, userName } = input;
  const measure = measurePhrase(billNumber, billTitle);
  return {
    subject: intentToVeto ? `Please reconsider your intent to veto ${billNumber}` : `Please sign ${billNumber} into law`,
    body: [
      GOVERNOR_GREETING,
      ``,
      intentToVeto
        ? `I am writing as a Hawaii resident to respectfully urge you to reconsider your intent to veto ${measure} and to allow it to become law.`
        : `I am writing as a Hawaii resident to respectfully urge you to sign ${measure} into law.`,
      ``,
      `This measure passed both chambers of the Legislature, and I believe it will make a real difference for our community.`,
      ``,
      `Thank you for your time and consideration.`,
      ``,
      `Mahalo nui loa,`,
      `${userName ?? NAME_PLACEHOLDER}`,
    ].join('\n'),
  };
}

/** Spoken phone script for the Governor's office. First-person, no greeting/signature. */
export function buildGovernorCallScript(input: {
  billNumber: string;
  billTitle: string | null;
  intentToVeto: boolean;
  userName?: string;
}): string {
  const { billNumber, billTitle, intentToVeto, userName } = input;
  const measure = measurePhrase(billNumber, billTitle, { trailingComma: false });
  return [
    `Hi, my name is ${userName ?? NAME_PLACEHOLDER} and I'm a Hawaii resident.`,
    ``,
    intentToVeto
      ? `I'm calling to respectfully ask the Governor to reconsider the intent to veto ${measure} and let it become law.`
      : `I'm calling to respectfully ask the Governor to sign ${measure} into law.`,
    ``,
    `This measure passed both chambers, and it matters to me. Thank you for your time.`,
  ].join('\n');
}

/**
 * The bill's introducers as surname entries for the legislator lookup — after a
 * final veto they're the members most likely to move an override. Introducers
 * sit in the bill's originating chamber (SB → Senate, HB → House). Handles
 * "LEE, M." (the initial is re-attached to its surname) and drops notes like
 * "(Introduced by request of another party)". `isChair` is always false.
 */
export function parseIntroducers(introducer: string | null | undefined, billNumber: string): ParsedConferee[] {
  if (!introducer) return [];
  const chamber = billNumber.toUpperCase().startsWith('SB') ? 'Senate' : 'House';
  const names: string[] = [];
  for (const raw of introducer.replace(/\([^)]*\)/g, '').split(',')) {
    const token = raw.trim();
    if (!token) continue;
    if (/^[A-Z]\.?$/i.test(token) && names.length > 0) names[names.length - 1] += `, ${token}`;
    else names.push(token);
  }
  return names.map((surname) => ({ surname, chamber, isChair: false }));
}
