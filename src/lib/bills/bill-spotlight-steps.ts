import type { ReadingStep } from '@/lib/bills/bill-reading-steps';

/**
 * Elements of the bill details dialog the spotlight tour can point at. Each is
 * marked in the dialog with data-bill-tour="<target>".
 */
export type SpotlightTarget =
  | 'number'
  | 'title'
  | 'stage'
  | 'standing'
  | 'committees'
  | 'version'
  | 'introducers'
  | 'updates'
  | 'actions';

export interface SpotlightStep {
  id: string;
  target: SpotlightTarget;
  label: string;
  /** The bill's real value for this part, when it has one. */
  value: string | null;
  body: string;
}

/**
 * Spotlight tour steps in the order a newcomer should read the dialog. Content
 * for each part of the bill comes from the reading steps (so the explanations
 * stay the single source of truth); the stage, updates and actions steps have no
 * per-bill value to show and use fixed copy.
 */
export function buildSpotlightSteps(reading: readonly ReadingStep[]): SpotlightStep[] {
  const byId = new Map(reading.map((s) => [s.id, s]));
  const steps: SpotlightStep[] = [];

  const number = byId.get('number');
  if (number) {
    steps.push({ id: 'number', target: 'number', label: number.label, value: number.value, body: number.explanation });
  }

  const title = byId.get('title');
  if (title) {
    steps.push({ id: 'title', target: 'title', label: title.label, value: title.value, body: title.explanation });
  }

  const stage = byId.get('stage');
  steps.push(
    stage
      ? { id: 'stage', target: 'stage', label: stage.label, value: stage.value, body: stage.explanation }
      : {
          id: 'stage',
          target: 'stage',
          label: 'How far it got',
          value: null,
          body: 'This bar shows how far the bill has come through the legislative process, from Introduced to Law.',
        }
  );

  // The "where it stands" card shows the bill's status and, for a live bill,
  // its next deadline — so they share one step.
  const status = byId.get('status');
  const deadline = byId.get('deadline');
  if (status || deadline) {
    const parts = [status?.explanation, deadline && `Next deadline, ${deadline.value}: ${deadline.explanation}`];
    steps.push({
      id: 'standing',
      target: 'standing',
      label: status ? status.label : deadline!.label,
      value: status ? status.value : deadline!.value,
      body: parts.filter(Boolean).join(' '),
    });
  }

  const committees = byId.get('committees');
  if (committees) {
    steps.push({ id: 'committees', target: 'committees', label: committees.label, value: committees.value, body: committees.explanation });
  }

  const version = byId.get('version');
  if (version) {
    steps.push({ id: 'version', target: 'version', label: version.label, value: version.value, body: version.explanation });
  }

  const introducer = byId.get('introducer');
  if (introducer) {
    steps.push({ id: 'introducers', target: 'introducers', label: introducer.label, value: introducer.value, body: introducer.explanation });
  }

  steps.push({
    id: 'updates',
    target: 'updates',
    label: 'Status updates',
    value: null,
    body: 'The official history of the bill, newest first. Each entry is something that happened to it, and the letter shows the chamber: H for House, S for Senate.',
  });

  steps.push({
    id: 'actions',
    target: 'actions',
    label: 'Take action',
    value: null,
    body: 'Track the bill to follow it, write testimony before its hearing, or contact a legislator.',
  });

  return steps;
}
