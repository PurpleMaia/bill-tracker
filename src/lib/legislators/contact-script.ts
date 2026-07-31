import type { CommitteeChair } from '@/db/queries/committee-chairs';

export type ContactPosition = 'support' | 'oppose';

/** The greeting line placeholder used by the shared (un-personalized) script. */
export const NEUTRAL_GREETING = 'Dear Chair,';

function scriptBody(input: {
  greeting: string;
  billNumber: string;
  billTitle: string | null;
  position: ContactPosition;
  userName?: string;
  /** Optional committee name for the per-recipient variant. */
  committeeName?: string;
}): string {
  const { greeting, billNumber, billTitle, position, userName, committeeName } = input;
  const verb = position === 'support' ? 'support' : 'oppose';
  const measure = billTitle ? `${billNumber}, ${billTitle},` : `${billNumber}`;
  const before = committeeName ? ` currently before the ${committeeName} committee` : ' currently before your committee';

  return [
    greeting,
    ``,
    `My name is ${userName ?? '[Your name]'}, and I am writing to ask you to ${verb} ${measure}${before}.`,
    ``,
    position === 'support'
      ? `This measure matters to our community, and I respectfully urge the committee to advance it.`
      : `I have serious concerns about this measure, and I respectfully urge the committee to hold it.`,
    ``,
    `Thank you for your time and your service.`,
    ``,
    `Sincerely,`,
    `${userName ?? '[Your name]'}`,
  ].join('\n');
}

function subjectLine(position: ContactPosition, billNumber: string): string {
  const stance = position === 'support' ? 'Support' : 'Oppose';
  return `${stance} for ${billNumber}`;
}

/**
 * Builds a short, polite advocacy message to a committee chair/vice-chair.
 * Pure — no DB, no LLM, no network. `subject` feeds a mailto link.
 */
export function buildContactScript(input: {
  billNumber: string;
  billTitle: string | null;
  chair: CommitteeChair;
  position: ContactPosition;
  userName?: string;
}): { subject: string; body: string } {
  const { billNumber, billTitle, chair, position, userName } = input;
  return {
    subject: subjectLine(position, billNumber),
    body: scriptBody({
      greeting: `Dear ${chair.legislatorName},`,
      billNumber,
      billTitle,
      position,
      userName,
      committeeName: chair.committeeName,
    }),
  };
}

/**
 * The ONE shared, editable script for a bill+position — greeting is neutral
 * (`Dear Chair,`) so the user edits a single message and sends it to any
 * committee chair. Personalize per-recipient at send time with
 * {@link personalizeScript}.
 */
export function buildBaseScript(input: {
  billNumber: string;
  billTitle: string | null;
  position: ContactPosition;
  userName?: string;
}): { subject: string; body: string } {
  const { billNumber, billTitle, position, userName } = input;
  return {
    subject: subjectLine(position, billNumber),
    body: scriptBody({
      greeting: NEUTRAL_GREETING,
      billNumber,
      billTitle,
      position,
      userName,
    }),
  };
}

/**
 * A short spoken phone script — what to say when calling a committee office.
 * Position-aware, first-person, no greeting/signature. Pure.
 */
export function buildCallScript(input: {
  billNumber: string;
  billTitle: string | null;
  position: ContactPosition;
  userName?: string;
}): string {
  const { billNumber, billTitle, position, userName } = input;
  const verb = position === 'support' ? 'support' : 'oppose';
  const measure = billTitle ? `${billNumber}, ${billTitle}` : billNumber;
  const ask =
    position === 'support'
      ? `I'm asking the committee to advance it.`
      : `I'm asking the committee to hold it.`;

  return [
    `Hi, my name is ${userName ?? '[Your name]'} and I'm a Hawaii resident.`,
    ``,
    `I'm calling to ask the chair to ${verb} ${measure}. ${ask}`,
    ``,
    `This measure matters to our community. Thank you for your time.`,
  ].join('\n');
}

/**
 * Swaps the leading greeting line of a shared script for one addressed to a
 * specific chair (`Dear Rep. …,`). Only the first line is replaced, so the
 * user's edits to the rest of the body are preserved. If the body doesn't
 * start with a `Dear …` line, the personalized greeting is prepended.
 */
export function personalizeScript(body: string, chair: CommitteeChair): string {
  const greeting = `Dear ${chair.legislatorName},`;
  const lines = body.split('\n');
  if (lines.length > 0 && /^\s*Dear\b.*$/.test(lines[0])) {
    lines[0] = greeting;
    return lines.join('\n');
  }
  return `${greeting}\n\n${body}`;
}
