import { describe, it, expect } from 'vitest';
import {
  DETAILED_STAGE_GROUPS,
  hasDetailedChildren,
  detailedChildIds,
  parentStageOf,
  expandStagesToStatuses,
} from '../bills/detailed-stages';
import { STATUS_TO_SIMPLIFIED, SIMPLIFIED_COLUMNS } from '../bills/kanban-columns';

describe('DETAILED_STAGE_GROUPS', () => {
  it('only expands ids that are real simplified stages', () => {
    const simplifiedIds = new Set(SIMPLIFIED_COLUMNS.map((c) => c.id));
    for (const parent of Object.keys(DETAILED_STAGE_GROUPS)) {
      expect(simplifiedIds.has(parent), parent).toBe(true);
    }
  });

  it('every child is a concrete status that maps back to its parent stage', () => {
    for (const [parent, groups] of Object.entries(DETAILED_STAGE_GROUPS)) {
      for (const group of groups) {
        for (const child of group.children) {
          // The child must be a real status the DB query can filter on...
          expect(STATUS_TO_SIMPLIFIED[child.id], child.id).toBeDefined();
          // ...and it must belong to the stage it's listed under, or the filter
          // would show a bill under the wrong parent.
          expect(STATUS_TO_SIMPLIFIED[child.id], child.id).toBe(parent);
        }
      }
    }
  });

  it('has no duplicate child ids within or across stages', () => {
    const all = Object.values(DETAILED_STAGE_GROUPS)
      .flat()
      .flatMap((g) => g.children.map((c) => c.id));
    expect(new Set(all).size).toBe(all.length);
  });

  it('gives every child a non-empty, unique label', () => {
    const labels = Object.values(DETAILED_STAGE_GROUPS)
      .flat()
      .flatMap((g) => g.children.map((c) => c.label));
    for (const label of labels) expect(label.length).toBeGreaterThan(0);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('hasDetailedChildren', () => {
  it('is true for expandable stages, false for 1:1 stages', () => {
    expect(hasDetailedChildren('simpleScheduled')).toBe(true);
    expect(hasDetailedChildren('transmittedGovernor')).toBe(false);
    expect(hasDetailedChildren('nonsense')).toBe(false);
  });
});

describe('detailedChildIds', () => {
  it('flattens all groups of a stage', () => {
    expect(detailedChildIds('simpleScheduled')).toEqual([
      'scheduled1',
      'scheduled2',
      'scheduled3',
    ]);
  });

  it('is empty for a stage with no children', () => {
    expect(detailedChildIds('transmittedGovernor')).toEqual([]);
  });
});

describe('expandStagesToStatuses', () => {
  it('fans a simplified id out to all its concrete statuses', () => {
    // simpleWaiting groups introduced, waiting2, waiting3 (per STATUS_TO_SIMPLIFIED).
    expect(expandStagesToStatuses(['simpleWaiting']).sort()).toEqual(
      ['introduced', 'waiting2', 'waiting3'].sort(),
    );
  });

  it('passes a concrete status through as-is', () => {
    expect(expandStagesToStatuses(['scheduled1'])).toEqual(['scheduled1']);
  });

  it('mixes simplified and concrete ids in one request', () => {
    const out = expandStagesToStatuses(['scheduled1', 'simpleWaiting']);
    expect(out).toContain('scheduled1');
    expect(out).toContain('introduced');
    expect(out).toContain('waiting2');
  });

  it('dedupes when a parent and its child are both selected', () => {
    // simpleScheduled fans out to include scheduled1; selecting both must not
    // list scheduled1 twice.
    const out = expandStagesToStatuses(['simpleScheduled', 'scheduled1']);
    expect(out.filter((s) => s === 'scheduled1')).toHaveLength(1);
  });

  it('is empty for an empty request', () => {
    expect(expandStagesToStatuses([])).toEqual([]);
  });
});

describe('parentStageOf', () => {
  it('returns a simplified id unchanged', () => {
    expect(parentStageOf('simpleScheduled')).toBe('simpleScheduled');
  });

  it('resolves an authored child to its parent', () => {
    expect(parentStageOf('scheduled2')).toBe('simpleScheduled');
    expect(parentStageOf('crossoverWaiting3')).toBe('simpleCrossoverWaiting');
  });

  it('resolves a concrete status with no authored child (deferred) via the shared map', () => {
    // deferred1 has no filter child, but still belongs under simpleScheduled.
    expect(parentStageOf('deferred1')).toBe('simpleScheduled');
  });

  it('returns null for an unknown value', () => {
    expect(parentStageOf('nonsense')).toBeNull();
  });
});
