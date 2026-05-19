import { describe, it, expect } from 'vitest';
import { KANBAN_COLUMNS, COLUMN_TITLES, COLUMN_INDEX } from '../kanban-columns';

describe('KANBAN_COLUMNS', () => {
  it('is a non-empty array', () => {
    expect(KANBAN_COLUMNS.length).toBeGreaterThan(0);
  });

  it('starts with unassigned', () => {
    expect(KANBAN_COLUMNS[0].id).toBe('unassigned');
  });

  it('ends with lawWithoutSignature', () => {
    expect(KANBAN_COLUMNS[KANBAN_COLUMNS.length - 1].id).toBe('lawWithoutSignature');
  });

  it('each column has id and title', () => {
    for (const col of KANBAN_COLUMNS) {
      expect(typeof col.id).toBe('string');
      expect(col.id.length).toBeGreaterThan(0);
      expect(typeof col.title).toBe('string');
      expect(col.title.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate ids', () => {
    const ids = KANBAN_COLUMNS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('contains key legislative milestones in order', () => {
    const ids = KANBAN_COLUMNS.map((c) => c.id);
    const introduced = ids.indexOf('introduced');
    const crossover = ids.indexOf('crossoverWaiting1');
    const passedCommittees = ids.indexOf('passedCommittees');
    const governorSigns = ids.indexOf('governorSigns');

    expect(introduced).toBeGreaterThan(0); // after unassigned
    expect(crossover).toBeGreaterThan(introduced);
    expect(passedCommittees).toBeGreaterThan(crossover);
    expect(governorSigns).toBeGreaterThan(passedCommittees);
  });
});

describe('COLUMN_TITLES', () => {
  it('has an entry for every column', () => {
    for (const col of KANBAN_COLUMNS) {
      expect(COLUMN_TITLES[col.id]).toBe(col.title);
    }
  });

  it('returns undefined for unknown columns', () => {
    expect(COLUMN_TITLES['nonexistent']).toBeUndefined();
  });
});

describe('COLUMN_INDEX', () => {
  it('has an entry for every column', () => {
    for (let i = 0; i < KANBAN_COLUMNS.length; i++) {
      expect(COLUMN_INDEX[KANBAN_COLUMNS[i].id]).toBe(i);
    }
  });

  it('unassigned is index 0', () => {
    expect(COLUMN_INDEX['unassigned']).toBe(0);
  });

  it('indices are monotonically increasing', () => {
    const ids = KANBAN_COLUMNS.map((c) => c.id);
    for (let i = 1; i < ids.length; i++) {
      expect(COLUMN_INDEX[ids[i]]).toBeGreaterThan(COLUMN_INDEX[ids[i - 1]]);
    }
  });

  it('returns undefined for unknown columns', () => {
    expect(COLUMN_INDEX['nonexistent']).toBeUndefined();
  });
});
