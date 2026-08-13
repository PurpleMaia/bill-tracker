import { describe, it, expect } from 'vitest';
import { PROGRESS_STAGES, getProgressValue, getCurrentStageName } from '@/lib/bills/progress-stages';
import { KANBAN_COLUMNS } from '@/lib/bills/kanban-columns';
import type { BillStatus } from '@/types/legislation';

describe('PROGRESS_STAGES', () => {
  it('gives every stage a unique id and a non-empty description', () => {
    const ids = PROGRESS_STAGES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const stage of PROGRESS_STAGES) {
      expect(stage.description.length, stage.id).toBeGreaterThan(0);
    }
  });

  it('maps every KANBAN_COLUMNS status to exactly one stage', () => {
    for (const col of KANBAN_COLUMNS) {
      if (col.id === 'unassigned') continue;
      const matches = PROGRESS_STAGES.filter((s) => s.statuses.includes(col.id));
      expect(matches, `status ${col.id}`).toHaveLength(1);
    }
  });

  it('returns an increasing progress value along the arc', () => {
    expect(getProgressValue('introduced' as BillStatus)).toBeLessThan(
      getProgressValue('conferencePassed' as BillStatus)
    );
  });

  it('names the current stage, falling back for unknown statuses', () => {
    expect(getCurrentStageName('governorSigns' as BillStatus)).toBe('Law');
    expect(getCurrentStageName('nonsense' as BillStatus)).toBe('Not Assigned');
  });
});
