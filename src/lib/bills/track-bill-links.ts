/**
 * Links from the kanban board to the search page's track flow. Pure URL
 * construction, no DB — safe for src/lib.
 *
 * The board is where users decide they want to add a bill; the search page is
 * where they find and one-click-track it. These helpers build that bridge:
 * a plain link to search, and a stage-scoped link from a specific column.
 */

import { SIMPLIFIED_COLUMNS, STATUS_TO_SIMPLIFIED } from './kanban-columns';

/** The search page — the primary "find a bill to track" destination. */
export const SEARCH_TRACK_HREF = '/search';

/** Simplified stage ids the search rail's Stage filter understands. */
const SIMPLIFIED_STAGE_IDS = new Set(SIMPLIFIED_COLUMNS.map((c) => c.id));

/**
 * The simplified stage a board column maps to. The search page filters by
 * simplified stage ids, but a column may be either a concrete status
 * (detailed view: 'scheduled1') or already a simplified id (simplified view:
 * 'simpleWaiting'). Concrete statuses map through STATUS_TO_SIMPLIFIED — the
 * same table the board and the DB query use; simplified ids pass through.
 * Returns null for an id in neither, so the caller can drop the stage param
 * rather than emit a filter the search page can't honor.
 */
function columnToStage(columnId: string): string | null {
  if (SIMPLIFIED_STAGE_IDS.has(columnId)) return columnId;
  return STATUS_TO_SIMPLIFIED[columnId] ?? null;
}

/**
 * Search-page link pre-filtered to the bills a user could add at a given
 * column's stage: scoped to that stage and to `untracked`, so the list shows
 * only bills not already on the board — the ones worth adding. An unknown
 * column drops the stage filter but keeps the untracked scope.
 */
export function columnTrackSearchHref(columnId: string): string {
  const stage = columnToStage(columnId);
  const params = new URLSearchParams();
  if (stage) params.set('stages', stage);
  params.set('tracked', 'untracked');
  return `${SEARCH_TRACK_HREF}?${params.toString()}`;
}
