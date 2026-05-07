export interface KanbanColumnData {
  id: string;
  title: string;
}

export const KANBAN_COLUMNS: KanbanColumnData[] = [
  { id: 'unassigned', title: 'Not Assigned' },
  { id: 'introduced', title: 'Introduced/Waiting to be Scheduled for First Committee Hearing' },
  { id: 'scheduled1', title: 'Scheduled for First Committee Hearing' },
  { id: 'deferred1', title: 'Deferred after First Committee Hearing' },
  { id: 'waiting2', title: 'Waiting to be Scheduled for Second Committee Hearing' },
  { id: 'scheduled2', title: 'Scheduled for Second Committee Hearing' },
  { id: 'deferred2', title: 'Deferred after Second Committee Hearing' },
  { id: 'waiting3', title: 'Waiting to be Scheduled for Third Committee Hearing' },
  { id: 'scheduled3', title: 'Scheduled for Third Committee Hearing' },
  { id: 'deferred3', title: 'Deferred after Third Committee Hearing' },
  { id: 'crossoverWaiting1', title: 'Crossover/Waiting to be Scheduled for First Committee Hearing' },
  { id: 'crossoverScheduled1', title: 'Scheduled for First Committee Hearing after Crossover' },
  { id: 'crossoverDeferred1', title: 'Deferred after First Committee Hearing after Crossover' },
  { id: 'crossoverWaiting2', title: 'Waiting to be Scheduled for Second Committee Hearing after Crossover' },
  { id: 'crossoverScheduled2', title: 'Scheduled for Second Committee Hearing after Crossover' },
  { id: 'crossoverDeferred2', title: 'Deferred after Second Committee Hearing after Crossover' },
  { id: 'crossoverWaiting3', title: 'Waiting to be Scheduled for Third Committee Hearing after Crossover' },
  { id: 'crossoverScheduled3', title: 'Scheduled for Third Committee Hearing after Crossover' },
  { id: 'crossoverDeferred3', title: 'Deferred after Third Committee Hearing after Crossover' },
  { id: 'passedCommittees', title: 'Passed all Committees!' },
  { id: 'conferenceAssigned', title: 'Assigned Conference Committees' },
  { id: 'conferenceScheduled', title: 'Scheduled for Conference Hearing' },
  { id: 'conferenceDeferred', title: 'Deferred during Conference Committee' },
  { id: 'conferencePassed', title: 'Passed Conference Committee' },
  { id: 'transmittedGovernor', title: 'Transmitted to Governor' },
  { id: 'vetoList', title: 'Governor\'s intent to Veto List' },
  { id: 'governorSigns', title: 'Governor Signs Bill into Law' },
  { id: 'lawWithoutSignature', title: 'Became law without Gov Signature' },
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
