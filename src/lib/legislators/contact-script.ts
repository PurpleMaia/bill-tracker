import type { CommitteeChair } from '@/db/queries/committee-chairs';

/** The greeting line placeholder used by the shared (un-personalized) script. */
export const NEUTRAL_GREETING = 'Dear Chair,';

/** Placeholder the user fills in with their own name before sending. */
export const NAME_PLACEHOLDER = '<your-name>';

/**
 * The measure phrase for a bill: "HB1572, Relating to Aquaculture," when a title
 * is present, otherwise just the number. Null-safe (never prints "null").
 */
function measurePhrase(billNumber: string, billTitle: string | null): string {
  return billTitle ? `${billNumber}, ${billTitle},` : billNumber;
}

/**
 * The clause naming the committee the request is directed at. Uses the inferred
 * current committee name when we have one, else a neutral fallback.
 */
function committeeClause(committeeName?: string): string {
  return committeeName ? `the ${committeeName}` : 'the committee';
}

function scriptBody(input: {
  greeting: string;
  billNumber: string;
  billTitle: string | null;
  userName?: string;
  /** The committee the bill is currently awaiting a hearing before. */
  committeeName?: string;
}): string {
  const { greeting, billNumber, billTitle, userName, committeeName } = input;
  const measure = measurePhrase(billNumber, billTitle);
  const before = committeeClause(committeeName);

  return [
    greeting,
    ``,
    `I am writing to respectfully request a hearing for ${measure} before ${before}.`,
    ``,
    `This measure is currently awaiting a hearing, and scheduling one would give the public an opportunity to weigh in and let the process move forward.`,
    ``,
    `Thank you for your time and consideration.`,
    ``,
    `Mahalo nui loa,`,
    `${userName ?? NAME_PLACEHOLDER}`,
  ].join('\n');
}

function subjectLine(billNumber: string): string {
  return `Hearing request for ${billNumber}`;
}

/**
 * Builds a short, polite hearing-request message to a committee chair/vice-chair.
 * Pure — no DB, no LLM, no network. `subject` feeds a mailto link.
 */
export function buildContactScript(input: {
  billNumber: string;
  billTitle: string | null;
  chair: CommitteeChair;
  userName?: string;
}): { subject: string; body: string } {
  const { billNumber, billTitle, chair, userName } = input;
  return {
    subject: subjectLine(billNumber),
    body: scriptBody({
      greeting: `Dear ${chair.legislatorName},`,
      billNumber,
      billTitle,
      userName,
      committeeName: chair.committeeName,
    }),
  };
}

/**
 * The ONE shared, editable script for a bill — greeting is neutral (`Dear Chair,`)
 * so the user edits a single message and sends it to any committee chair.
 * Personalize per-recipient at send time with {@link personalizeScript}.
 */
export function buildBaseScript(input: {
  billNumber: string;
  billTitle: string | null;
  userName?: string;
  /** The committee the bill is currently awaiting a hearing before. */
  committeeName?: string;
}): { subject: string; body: string } {
  const { billNumber, billTitle, userName, committeeName } = input;
  return {
    subject: subjectLine(billNumber),
    body: scriptBody({
      greeting: NEUTRAL_GREETING,
      billNumber,
      billTitle,
      userName,
      committeeName,
    }),
  };
}

/**
 * A short spoken phone script — what to say when calling a committee office to
 * ask for a hearing. First-person, no greeting/signature. Pure.
 */
export function buildCallScript(input: {
  billNumber: string;
  billTitle: string | null;
  userName?: string;
  /** The committee the bill is currently awaiting a hearing before. */
  committeeName?: string;
}): string {
  const { billNumber, billTitle, userName, committeeName } = input;
  const measure = billTitle ? `${billNumber}, ${billTitle}` : billNumber;
  const before = committeeName ? `the ${committeeName}` : 'this committee';

  return [
    `Hi, my name is ${userName ?? NAME_PLACEHOLDER} and I'm a Hawaii resident.`,
    ``,
    `I'm calling to respectfully ask ${before} to schedule a hearing for ${measure}.`,
    ``,
    `This measure is awaiting a hearing, and scheduling one would let the public weigh in. Thank you for your time.`,
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
