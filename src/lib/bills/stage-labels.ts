import { SIMPLIFIED_COLUMNS } from '@/lib/bills/kanban-columns';
import { DETAILED_STAGE_GROUPS } from '@/lib/bills/detailed-stages';

/** Concrete-status label lookup, built from the detailed-stage children. */
const DETAILED_CHILD_LABELS: Record<string, string> = Object.values(DETAILED_STAGE_GROUPS)
  .flat()
  .flatMap((g) => g.children)
  .reduce<Record<string, string>>((acc, child) => {
    acc[child.id] = child.label;
    return acc;
  }, {});

/**
 * Display labels for the search page's Stage filter.
 *
 * SIMPLIFIED_COLUMNS is shared with the kanban board, where two entries
 * ('simpleScheduled' and 'conferenceScheduled') carry the identical title
 * 'SCHEDULED'. On the board that reads fine because position supplies the
 * context — one sits in the pre-crossover group, the other in the conference
 * group. A flat filter list has no such context, so without an override the user
 * sees two indistinguishable "scheduled" options.
 *
 * Lives here rather than in a component because both the rail and the active
 * filter chips need it, and duplicating the map would let the two drift.
 */
const STAGE_LABEL_OVERRIDES: Record<string, string> = {
  simpleScheduled: 'scheduled',
  conferenceScheduled: 'conference scheduled',
};

/**
 * Human label for a stage filter id — either a simplified stage or one of the
 * detailed concrete statuses the filter can expand to. Falls back to the id if
 * unknown.
 */
export function stageLabel(stageId: string): string {
  if (stageId in DETAILED_CHILD_LABELS) return DETAILED_CHILD_LABELS[stageId];
  const column = SIMPLIFIED_COLUMNS.find((c) => c.id === stageId);
  return STAGE_LABEL_OVERRIDES[stageId] ?? column?.title.toLowerCase() ?? stageId;
}
