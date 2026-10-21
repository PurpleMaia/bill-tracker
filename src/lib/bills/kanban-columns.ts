export interface KanbanColumnData {
  id: string;
  title: string;
}

export const KANBAN_COLUMNS: KanbanColumnData[] = [
  // { id: 'unassigned', title: 'Not Assigned' },
  // { id: 'introduced', title: 'Introduced/Waiting to be Scheduled for First Committee Hearing' },
  { id: 'introduced', title: 'INTRODUCED & WAITING 1ST' },
  // { id: 'scheduled1', title: 'Scheduled for First Committee Hearing' },
  { id: 'scheduled1', title: 'SCHEDULED 1ST' },
  // { id: 'deferred1', title: 'Deferred after First Committee Hearing' },
  // { id: 'waiting2', title: 'Waiting to be Scheduled for Second Committee Hearing' },
  { id: 'waiting2', title: 'WAITING 2ND' },
  // { id: 'scheduled2', title: 'Scheduled for Second Committee Hearing' },
  { id: 'scheduled2', title: 'SCHEDULED 2ND' },
  // { id: 'deferred2', title: 'Deferred after Second Committee Hearing' },
  // { id: 'waiting3', title: 'Waiting to be Scheduled for Third Committee Hearing' },
  { id: 'waiting3', title: 'WAITING 3RD' },
  // { id: 'scheduled3', title: 'Scheduled for Third Committee Hearing' },
  { id: 'scheduled3', title: 'SCHEDULED 3RD' },
  // { id: 'deferred3', title: 'Deferred after Third Committee Hearing' },
  // { id: 'crossoverWaiting1', title: 'Crossover/Waiting to be Scheduled for First Committee Hearing' },
  { id: 'crossoverWaiting1', title: 'CROSSOVER & WAITING 1ST' },
  { id: 'crossoverScheduled1', title: 'SCHEDULED 1ST' },
  // { id: 'crossoverDeferred1', title: 'Deferred after First Committee Hearing after Crossover' },
  // { id: 'crossoverWaiting2', title: 'Waiting to be Scheduled for Second Committee Hearing after Crossover' },
  { id: 'crossoverWaiting2', title: 'WAITING 2ND' },
  // { id: 'crossoverScheduled2', title: 'Scheduled for Second Committee Hearing after Crossover' },
  { id: 'crossoverScheduled2', title: 'SCHEDULED 2ND' },
  // { id: 'crossoverDeferred2', title: 'Deferred after Second Committee Hearing after Crossover' },
  // { id: 'crossoverWaiting3', title: 'Waiting to be Scheduled for Third Committee Hearing after Crossover' },
  { id: 'crossoverWaiting3', title: 'WAITING 3RD' },
  // { id: 'crossoverScheduled3', title: 'Scheduled for Third Committee Hearing after Crossover' },
  { id: 'crossoverScheduled3', title: 'SCHEDULED 3RD' },
  // { id: 'crossoverDeferred3', title: 'Deferred after Third Committee Hearing after Crossover' },
  // { id: 'passedCommittees', title: 'Passed all Committees!' },
  { id: 'passedCommittees', title: 'CONFERENCE' },
  // { id: 'conferenceAssigned', title: 'Assigned Conference Committees' },
  { id: 'conferenceAssigned', title: 'AWAITING COMMITTEES' },
  // { id: 'conferenceScheduled', title: 'Scheduled for Conference Hearing' },
  { id: 'conferenceScheduled', title: 'SCHEDULED' },
  // { id: 'conferenceDeferred', title: 'Deferred during Conference Committee' },
  { id: 'conferencePassed', title: 'PASSED CONFERENCE' },
  { id: 'transmittedGovernor', title: 'TRANSMITTED TO GOVERNOR' },
  { id: 'vetoList', title: 'GOVERNOR VETOED' },
  { id: 'governorSigns', title: 'GOVERNOR SIGNED INTO LAW' },
  { id: 'lawWithoutSignature', title: 'LAW WITHOUT SIGNATURE' },
];

/**
 * Map a column ID (or bill status) to its legislative-phase background class.
 * Single source of truth for the board's phase colors — the kanban column and
 * the bill briefing's "Where it stands" card both read from here so the enacted
 * green (and veto red) stay in sync.
 */
export function getColumnPhaseBg(columnId: string): string {
  if (columnId === 'vetoList') return 'bg-[#f8d7d2]';
  if (columnId === 'governorSigns' || columnId === 'lawWithoutSignature') return 'bg-[#d6e8d4]';
  // Waiting columns (introduced, waiting, crossover waiting) get olive
  if (columnId === 'introduced' || columnId === 'simpleWaiting' || columnId.startsWith('crossoverWaiting') || columnId === 'simpleCrossoverWaiting')
    return 'bg-olive-soft';
  // Passed committees and transmitted to governor get olive
  if (columnId === 'passedCommittees' || columnId === 'transmittedGovernor')
    return 'bg-olive-soft';
  return 'bg-secondary/50';
}

// Map column IDs (statuses) to titles for easier lookup
export const COLUMN_TITLES: Record<string, string> = KANBAN_COLUMNS.reduce((acc, col) => {
  acc[col.id] = col.title;
  return acc;
}, {} as Record<string, string>);

// Map column IDs to their index position for monotonic progression enforcement
export const COLUMN_INDEX: Record<string, number> = KANBAN_COLUMNS.reduce((acc, col, idx) => {
  acc[col.id] = idx;
  return acc;
}, {} as Record<string, number>);

// Statuses where the bill is waiting for a committee chair to schedule a
// hearing — the window where contacting legislators actually moves a bill.
export const AWAITING_HEARING_STATUSES: ReadonlySet<string> = new Set([
  'introduced',
  'waiting2',
  'waiting3',
  'crossoverWaiting1',
  'crossoverWaiting2',
  'crossoverWaiting3',
]);

export function isAwaitingHearing(status: string | null | undefined): boolean {
  return !!status && AWAITING_HEARING_STATUSES.has(status);
}

// Plain-language explanation of what each board column (status) means,
// shown in the column header's help popover. Keyed by column id, covering
// both detailed and simplified views.
export const COLUMN_DESCRIPTIONS: Record<string, string> = {
  // Detailed view — originating chamber
  introduced:
    'The bill has been introduced and passed First Reading in its originating chamber. It is waiting to be scheduled for a hearing by its first assigned committee.',
  scheduled1:
    'The bill has been scheduled for its first committee hearing. Public testimony can be submitted until 24 hours before the hearing.',
  waiting2:
    'The bill passed its first committee and is waiting to be scheduled for a hearing by its second assigned committee.',
  scheduled2:
    'The bill has been scheduled for its second committee hearing. Public testimony can be submitted until 24 hours before the hearing.',
  waiting3:
    'The bill passed its second committee and is waiting to be scheduled by its final committee, typically Finance or Ways and Means.',
  scheduled3:
    'The bill has been scheduled for its final committee hearing in this chamber. Public testimony can be submitted until 24 hours before the hearing.',
  // Detailed view — after crossover to the second chamber
  crossoverWaiting1:
    'The bill passed Third Reading and crossed over to the other chamber, where it is waiting to be scheduled by its first assigned committee.',
  crossoverScheduled1:
    'The bill has been scheduled for its first committee hearing in the second chamber. Public testimony can be submitted until 24 hours before the hearing.',
  crossoverWaiting2:
    'The bill passed its first committee in the second chamber and is waiting to be scheduled by its second committee.',
  crossoverScheduled2:
    'The bill has been scheduled for its second committee hearing in the second chamber. Public testimony can be submitted until 24 hours before the hearing.',
  crossoverWaiting3:
    'The bill passed its second committee in the second chamber and is waiting to be scheduled by its final committee.',
  crossoverScheduled3:
    'The bill has been scheduled for its final committee hearing in the second chamber. Public testimony can be submitted until 24 hours before the hearing.',
  // Conference and beyond (shared by both views)
  passedCommittees:
    'The bill passed all of its committees, but the House and Senate passed different versions. It heads to a conference committee to reconcile the differences.',
  conferenceAssigned:
    'The bill is in conference and waiting for conferees (negotiators from both chambers) to be appointed to work out a single compromise version.',
  conferenceScheduled:
    'A conference committee meeting has been scheduled to negotiate the differences between the House and Senate versions of the bill.',
  conferencePassed:
    'The conference committee agreed on a final compromise draft and both chambers passed it on Final Reading.',
  transmittedGovernor:
    'The bill has been sent to the Governor, who can sign it into law, let it become law without a signature, or veto it.',
  vetoList:
    'The Governor vetoed the bill or placed it on the intent-to-veto list. The legislature can override a veto with a two-thirds vote in each chamber.',
  governorSigns:
    'The Governor signed the bill into law. It is now an Act.',
  lawWithoutSignature:
    'The Governor allowed the deadline to pass without signing or vetoing, so the bill became law without a signature.',
  // Simplified view
  simpleWaiting:
    'The bill has been introduced in its originating chamber and is waiting to be scheduled for its next committee hearing.',
  simpleScheduled:
    'The bill has been scheduled for a committee hearing in its originating chamber. Public testimony can be submitted until 24 hours before the hearing.',
  simpleCrossoverWaiting:
    'The bill passed its originating chamber and crossed over to the other chamber, where it is waiting to be scheduled for its next committee hearing.',
  simpleCrossoverScheduled:
    'The bill has been scheduled for a committee hearing in the second chamber. Public testimony can be submitted until 24 hours before the hearing.',
};

export const SIMPLIFIED_COLUMNS: KanbanColumnData[] = [
  // { id: 'unassigned', title: 'Not Assigned' },
  { id: 'simpleWaiting', title: 'INTRODUCED & WAITING' },
  { id: 'simpleScheduled', title: 'SCHEDULED' },
  { id: 'simpleCrossoverWaiting', title: 'CROSSOVER & WAITING' },
  { id: 'simpleCrossoverScheduled', title: 'CROSSOVER SCHEDULED' },
  { id: 'passedCommittees', title: 'CONFERENCE' },
  { id: 'conferenceAssigned', title: 'AWAITING COMMITTEES' },
  { id: 'conferenceScheduled', title: 'SCHEDULED' },
  { id: 'conferencePassed', title: 'PASSED CONFERENCE' },
  { id: 'transmittedGovernor', title: 'TRANSMITTED TO GOVERNOR' },
  { id: 'vetoList', title: 'GOVERNOR VETOED' },
  { id: 'governorSigns', title: 'GOVERNOR SIGNED INTO LAW' },
  { id: 'lawWithoutSignature', title: 'LAW WITHOUT SIGNATURE' },
];

// Maps every BillStatus to the simplified column it belongs to
export const STATUS_TO_SIMPLIFIED: Record<string, string> = {
  unassigned: 'unassigned',
  // Pre-crossover waiting
  introduced: 'simpleWaiting',
  waiting2: 'simpleWaiting',
  waiting3: 'simpleWaiting',
  // Pre-crossover scheduled (includes deferred)
  scheduled1: 'simpleScheduled',
  scheduled2: 'simpleScheduled',
  scheduled3: 'simpleScheduled',
  deferred1: 'simpleScheduled',
  deferred2: 'simpleScheduled',
  deferred3: 'simpleScheduled',
  // Crossover waiting
  crossoverWaiting1: 'simpleCrossoverWaiting',
  crossoverWaiting2: 'simpleCrossoverWaiting',
  crossoverWaiting3: 'simpleCrossoverWaiting',
  // Crossover scheduled (includes deferred)
  crossoverScheduled1: 'simpleCrossoverScheduled',
  crossoverScheduled2: 'simpleCrossoverScheduled',
  crossoverScheduled3: 'simpleCrossoverScheduled',
  crossoverDeferred1: 'simpleCrossoverScheduled',
  crossoverDeferred2: 'simpleCrossoverScheduled',
  crossoverDeferred3: 'simpleCrossoverScheduled',
  // Conference (1:1)
  passedCommittees: 'passedCommittees',
  conferenceAssigned: 'conferenceAssigned',
  conferenceScheduled: 'conferenceScheduled',
  conferenceDeferred: 'conferenceScheduled',
  conferencePassed: 'conferencePassed',
  // Governor (1:1)
  transmittedGovernor: 'transmittedGovernor',
  vetoList: 'vetoList',
  governorSigns: 'governorSigns',
  lawWithoutSignature: 'lawWithoutSignature',
};
