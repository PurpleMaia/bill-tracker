/**
 * The search page's Stage filter shows the 12 simplified stages by default, but
 * a simplified stage can expand to reveal the concrete statuses it groups —
 * "Scheduled" opens to "Scheduled 1st / 2nd / 3rd". This module is the pure data
 * behind that: for each expandable simplified stage, its concrete children,
 * grouped by chamber phase and given disambiguated labels.
 *
 * Derived from STATUS_TO_SIMPLIFIED — the same table the board and the search
 * DB query use — so the filter can never offer a child the query won't honor.
 * No DB access; safe for src/lib.
 */

import { STATUS_TO_SIMPLIFIED } from './kanban-columns';

/** A concrete status shown as a child of a simplified stage. */
export interface DetailedStageChild {
  /** Concrete bill_status id, e.g. 'scheduled1'. Sent as a `stages` filter value. */
  id: string;
  /** Disambiguated label, e.g. 'Scheduled 1st' or 'Scheduled 1st (after crossover)'. */
  label: string;
}

/** A chamber-phase grouping of children within one expandable stage. */
export interface DetailedStageGroup {
  /** Group heading shown above its children, e.g. 'Originating chamber'. */
  heading: string;
  children: DetailedStageChild[];
}

/**
 * Hand-authored so the ORDER and LABELS read for a newcomer, rather than falling
 * out of object-key iteration. Only stages with more than one meaningful child
 * appear here; 1:1 stages (conference, governor, law) have no expansion.
 *
 * Deferred statuses are intentionally omitted as filter children: they collapse
 * into the scheduled columns on the board (STATUS_TO_SIMPLIFIED maps deferred1
 * -> simpleScheduled) and a "Deferred 1st" filter option would surface bills a
 * user thinks of as scheduled. The parent simplified stage still matches them.
 */
export const DETAILED_STAGE_GROUPS: Record<string, DetailedStageGroup[]> = {
  simpleWaiting: [
    {
      heading: 'Originating chamber',
      children: [
        { id: 'introduced', label: 'Introduced & waiting 1st' },
        { id: 'waiting2', label: 'Waiting 2nd' },
        { id: 'waiting3', label: 'Waiting 3rd' },
      ],
    },
  ],
  simpleScheduled: [
    {
      heading: 'Originating chamber',
      children: [
        { id: 'scheduled1', label: 'Scheduled 1st' },
        { id: 'scheduled2', label: 'Scheduled 2nd' },
        { id: 'scheduled3', label: 'Scheduled 3rd' },
      ],
    },
  ],
  simpleCrossoverWaiting: [
    {
      heading: 'After crossover',
      children: [
        { id: 'crossoverWaiting1', label: 'Crossover & waiting 1st' },
        { id: 'crossoverWaiting2', label: 'Waiting 2nd (after crossover)' },
        { id: 'crossoverWaiting3', label: 'Waiting 3rd (after crossover)' },
      ],
    },
  ],
  simpleCrossoverScheduled: [
    {
      heading: 'After crossover',
      children: [
        { id: 'crossoverScheduled1', label: 'Scheduled 1st (after crossover)' },
        { id: 'crossoverScheduled2', label: 'Scheduled 2nd (after crossover)' },
        { id: 'crossoverScheduled3', label: 'Scheduled 3rd (after crossover)' },
      ],
    },
  ],
};

/**
 * Expand requested stage filter ids to the concrete bill_status values the DB
 * stores. A requested id is either a simplified group id (fans out to every
 * concrete status mapping to it) or a concrete status (used as-is). Deduped,
 * since a simplified parent and one of its children can both be selected.
 *
 * The single source of truth for stage→status expansion, shared by the search
 * DB query so the filter UI and the query agree on what a stage means.
 */
export function expandStagesToStatuses(stages: string[]): string[] {
  return Array.from(
    new Set(
      stages.flatMap((stage) =>
        stage in STATUS_TO_SIMPLIFIED
          ? [stage] // already a concrete status
          : Object.entries(STATUS_TO_SIMPLIFIED)
              .filter(([, simplified]) => simplified === stage)
              .map(([status]) => status),
      ),
    ),
  );
}

/** Whether a simplified stage id can expand to concrete children. */
export function hasDetailedChildren(stageId: string): boolean {
  return stageId in DETAILED_STAGE_GROUPS;
}

/** Flat list of a stage's child concrete-status ids (all groups). */
export function detailedChildIds(stageId: string): string[] {
  return (DETAILED_STAGE_GROUPS[stageId] ?? []).flatMap((g) => g.children.map((c) => c.id));
}

/**
 * The simplified stage a selection value belongs under, whether the value is
 * already a simplified id or one of its concrete children. Drives which accordion
 * groups start open (a child in the URL opens its parent). Returns null for an
 * unknown value.
 */
export function parentStageOf(value: string): string | null {
  if (value in DETAILED_STAGE_GROUPS) return value;
  for (const [parent, groups] of Object.entries(DETAILED_STAGE_GROUPS)) {
    if (groups.some((g) => g.children.some((c) => c.id === value))) return parent;
  }
  // A concrete status with no authored child entry (e.g. a deferred status)
  // still belongs under its simplified stage per the shared mapping.
  return STATUS_TO_SIMPLIFIED[value] ?? null;
}
