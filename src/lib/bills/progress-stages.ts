// The coarse narrative arc of a bill, shared by the bill dialog's progress bar
// and the /learn walkthrough. This is deliberately COARSER than KANBAN_COLUMNS:
// six stages a newcomer can hold in their head, versus 21 precise statuses.
// Term-level status copy lives in COLUMN_DESCRIPTIONS, not here.
//
// Lifted out of bill-details-dialog.tsx so /learn cannot drift from the dialog.
import type { BillStatus } from '@/types/legislation';

export interface ProgressStage {
  id: string;
  name: string;
  /** Status ids that place a bill in this stage. Includes deferred statuses
   *  that are not KANBAN_COLUMNS entries — see EXTENDED_INDEX in derived-status. */
  statuses: string[];
  /** Novice-facing: what happens here and why the stage exists. */
  description: string;
}

export const PROGRESS_STAGES: readonly ProgressStage[] = [
  {
    id: 'introduced',
    name: 'Introduced',
    statuses: ['introduced'],
    description:
      'A legislator files the bill and it passes First Reading — a formal step that puts it on the record. It is then referred to committees, which decide whether it goes any further.',
  },
  {
    id: 'orig-chamber',
    name: 'Orig. Chamber',
    statuses: [
      'scheduled1',
      'deferred1',
      'waiting2',
      'scheduled2',
      'deferred2',
      'waiting3',
      'scheduled3',
      'deferred3',
      'crossoverWaiting1',
    ],
    description:
      'The bill works through committees in the chamber where it started. Each committee must hold a hearing and vote to advance it. Most bills die here, because a committee chair is not required to schedule a hearing at all.',
  },
  {
    id: 'non-orig-chamber',
    name: 'Non-Orig. Chamber',
    statuses: [
      'crossoverScheduled1',
      'crossoverDeferred1',
      'crossoverWaiting2',
      'crossoverScheduled2',
      'crossoverDeferred2',
      'crossoverWaiting3',
      'crossoverScheduled3',
      'crossoverDeferred3',
      'passedCommittees',
    ],
    description:
      'After passing its first chamber, the bill crosses over to the other one and starts committee review again from the beginning. Both chambers must agree on identical text before anything can become law — that is why this second pass exists.',
  },
  {
    id: 'conference',
    name: 'Conference',
    statuses: ['conferenceAssigned', 'conferenceScheduled', 'conferenceDeferred', 'conferencePassed'],
    description:
      'When the two chambers pass different versions, a small group of negotiators from each — conferees — meets to produce one compromise draft. If they cannot agree, the bill dies even though both chambers approved a version of it.',
  },
  {
    id: 'governor',
    name: 'Governor',
    statuses: ['transmittedGovernor', 'vetoList'],
    description:
      'The final text goes to the Governor, who can sign it, veto it, or let it become law without a signature. The legislature can override a veto with a two-thirds vote in each chamber.',
  },
  {
    id: 'law',
    name: 'Law',
    statuses: ['governorSigns', 'lawWithoutSignature'],
    description:
      'The bill is now an Act — part of Hawaii law. It usually takes effect on a date written into the text itself.',
  },
];

export const getProgressValue = (status: BillStatus): number => {
  const idx = PROGRESS_STAGES.findIndex((s) => s.statuses.includes(status));
  if (idx === -1) return status === 'introduced' ? (1 / (PROGRESS_STAGES.length + 1)) * 100 : 0;
  return ((idx + 1) / PROGRESS_STAGES.length) * 100;
};

export const getCurrentStageName = (status: BillStatus): string => {
  const stage = PROGRESS_STAGES.find((s) => s.statuses.includes(status));
  if (stage) return stage.name;
  if (status === 'introduced') return 'Introduced';
  return 'Not Assigned';
};
