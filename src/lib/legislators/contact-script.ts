import type { CommitteeChair } from '@/db/queries/committee-chairs';

export type ContactPosition = 'support' | 'oppose';

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

  const stance = position === 'support' ? 'Support' : 'Oppose';
  const verb = position === 'support' ? 'support' : 'oppose';
  const measure = billTitle ? `${billNumber}, ${billTitle},` : `${billNumber}`;

  const subject = `${stance} for ${billNumber}`;

  const body = [
    `Dear ${chair.legislatorName},`,
    ``,
    `My name is ${userName ?? '[Your name]'}, and I am writing to ask you to ${verb} ${measure} currently before the ${chair.committeeName} committee.`,
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

  return { subject, body };
}
