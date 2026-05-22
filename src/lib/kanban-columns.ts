export interface KanbanColumnData {
  id: string;
  title: string;
}

export const KANBAN_COLUMNS: KanbanColumnData[] = [
  { id: 'unassigned', title: 'Not Assigned' },
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

export const SIMPLIFIED_COLUMNS: KanbanColumnData[] = [
  { id: 'unassigned', title: 'Not Assigned' },
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
