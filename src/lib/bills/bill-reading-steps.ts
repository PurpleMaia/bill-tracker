import { GLOSSARY } from '@/lib/glossary/terms';
import {
  resolveStatusTerm,
  resolveCommitteeTerm,
  resolveVersionTerm,
  resolveDeadlineTerm,
} from '@/lib/glossary/resolvers';
import { PROGRESS_STAGES } from '@/lib/bills/progress-stages';
import { COLUMN_TITLES } from '@/lib/bills/kanban-columns';
import { parseCommittees } from '@/lib/bills/dead-bill';
import {
  parseCommitteeCodes,
  committeeFullName,
  hasJointReferral,
  JOINT_REFERRAL_NOTE,
  type CommitteeNameMap,
} from '@/lib/testimony/committees';

/**
 * The parts of a bill the "How to read this bill" walkthrough explains, each
 * pairing the bill's ACTUAL value with a plain-language meaning. Showing the real
 * value is the point: a generic glossary makes the reader map definitions onto
 * the bill themselves.
 */
export type ReadingStepId =
  | 'number'
  | 'title'
  | 'introducer'
  | 'committees'
  | 'version'
  | 'status'
  | 'stage'
  | 'deadline';

export interface ReadingStep {
  id: ReadingStepId;
  /** Short name of the part, e.g. "Bill number". */
  label: string;
  /** The bill's real value for this part. */
  value: string;
  /** What that value means, in plain language. */
  explanation: string;
}

export interface ReadingInput {
  billNumber: string | null;
  billTitle: string | null;
  introducer: string | null;
  committeeAssignment: string | null;
  /** Label of the latest version, e.g. "HB139_HD1"; null when none are loaded. */
  latestVersionLabel: string | null;
  currentStatus: string;
  /** Name of the next deadline, e.g. "First Decking". */
  deadlineName?: string | null;
  dead: boolean;
  committeeNames: CommitteeNameMap;
}

/** Ordered steps for a bill; parts the bill doesn't have are omitted. */
export function buildReadingSteps(input: ReadingInput): ReadingStep[] {
  const steps: ReadingStep[] = [];
  const number = input.billNumber || 'Unknown';
  const chamberWord = number.toUpperCase().startsWith('S') ? 'Senate' : 'House';
  const otherChamber = chamberWord === 'House' ? 'Senate' : 'House';

  steps.push({
    id: 'number',
    label: 'Bill number',
    value: number,
    explanation:
      `A ${chamberWord} bill — the "${chamberWord === 'House' ? 'HB' : 'SB'}" prefix means it ` +
      'was introduced there. The number is just filing order; a lower number does not mean the ' +
      'bill matters more.',
  });

  if (input.billTitle) {
    steps.push({
      id: 'title',
      label: 'Title',
      value: input.billTitle,
      explanation: GLOSSARY['relating-to'].short,
    });
  }

  if (input.introducer) {
    steps.push({
      id: 'introducer',
      label: 'Introduced by',
      value: input.introducer,
      explanation: GLOSSARY.introducers.short,
    });
  }

  // Raw referral tokens drive display so a joint referral (HHS/AEN) stays one
  // entry; the flattened codes drive the "must clear all N" count.
  const referrals = input.committeeAssignment ? parseCommittees(input.committeeAssignment) : [];
  if (referrals.length > 0) {
    const codes = parseCommitteeCodes(input.committeeAssignment);
    const named = referrals
      .map((referral) => {
        if (!resolveCommitteeTerm(referral, input.committeeNames)) return null;
        return referral.includes('/')
          ? `${referral} is a joint referral to ${committeeFullName(referral, input.committeeNames)}`
          : `${referral} is ${committeeFullName(referral, input.committeeNames)}`;
      })
      .filter(Boolean)
      .join('; ');
    steps.push({
      id: 'committees',
      label: 'Committees',
      value: referrals.join(', '),
      explanation:
        named +
        (codes.length > 1 ? `. This bill must clear all ${codes.length} to stay alive. ` : '. ') +
        GLOSSARY['committee-chair'].short +
        (hasJointReferral(input.committeeAssignment) ? ` ${JOINT_REFERRAL_NOTE}` : ''),
    });
  }

  if (input.latestVersionLabel) {
    const versionTerm = resolveVersionTerm(input.latestVersionLabel);
    steps.push({
      id: 'version',
      label: 'Version',
      value: input.latestVersionLabel,
      explanation: versionTerm
        ? versionTerm.short
        : `A snapshot of the bill's text. ${GLOSSARY['bill-version'].short}`,
    });
  }

  const statusTerm = resolveStatusTerm(input.currentStatus);
  if (statusTerm) {
    steps.push({
      id: 'status',
      label: 'Status',
      value: COLUMN_TITLES[input.currentStatus] ?? input.currentStatus,
      explanation: statusTerm.short,
    });
  }

  const stage = PROGRESS_STAGES.find((s) => s.statuses.includes(input.currentStatus));
  if (stage && !input.dead) {
    steps.push({
      id: 'stage',
      label: 'Stage',
      value: stage.name,
      explanation:
        stage.description +
        (stage.id === 'orig-chamber'
          ? ` If it passes here, it crosses over to the ${otherChamber} and starts committee review again.`
          : ''),
    });
  }

  const deadlineTerm = input.deadlineName ? resolveDeadlineTerm(input.deadlineName) : null;
  if (input.deadlineName && deadlineTerm) {
    steps.push({
      id: 'deadline',
      label: 'Next deadline',
      value: input.deadlineName,
      explanation: deadlineTerm.short,
    });
  }

  return steps;
}
