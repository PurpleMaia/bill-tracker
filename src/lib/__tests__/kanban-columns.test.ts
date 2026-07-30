import { describe, it, expect } from 'vitest';
import { KANBAN_COLUMNS, COLUMN_TITLES, COLUMN_INDEX, SIMPLIFIED_COLUMNS, STATUS_TO_SIMPLIFIED, COLUMN_DESCRIPTIONS, AWAITING_HEARING_STATUSES, isAwaitingHearing } from '../bills/kanban-columns';

describe('KANBAN_COLUMNS', () => {
  it('is a non-empty array', () => {
    expect(KANBAN_COLUMNS.length).toBeGreaterThan(0);
  });

  it('starts with introduced (unassigned is not a board column)', () => {
    expect(KANBAN_COLUMNS[0].id).toBe('introduced');
    expect(KANBAN_COLUMNS.some((c) => c.id === 'unassigned')).toBe(false);
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

    expect(introduced).toBe(0); // first board column
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

  it('introduced is index 0 and unassigned has no index', () => {
    expect(COLUMN_INDEX['introduced']).toBe(0);
    expect(COLUMN_INDEX['unassigned']).toBeUndefined();
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

describe('SIMPLIFIED_COLUMNS', () => {
  it('has exactly 12 columns', () => {
    expect(SIMPLIFIED_COLUMNS.length).toBe(12);
  });

  it('starts with simpleWaiting and ends with lawWithoutSignature', () => {
    expect(SIMPLIFIED_COLUMNS[0].id).toBe('simpleWaiting');
    expect(SIMPLIFIED_COLUMNS[SIMPLIFIED_COLUMNS.length - 1].id).toBe('lawWithoutSignature');
  });

  it('each column has id and title', () => {
    for (const col of SIMPLIFIED_COLUMNS) {
      expect(typeof col.id).toBe('string');
      expect(col.id.length).toBeGreaterThan(0);
      expect(typeof col.title).toBe('string');
      expect(col.title.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate ids', () => {
    const ids = SIMPLIFIED_COLUMNS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('contains key phases in order', () => {
    const ids = SIMPLIFIED_COLUMNS.map((c) => c.id);
    const waiting = ids.indexOf('simpleWaiting');
    const scheduled = ids.indexOf('simpleScheduled');
    const crossoverWaiting = ids.indexOf('simpleCrossoverWaiting');
    const crossoverScheduled = ids.indexOf('simpleCrossoverScheduled');
    const conference = ids.indexOf('passedCommittees');
    const governor = ids.indexOf('transmittedGovernor');

    expect(waiting).toBe(0); // first simplified column
    expect(scheduled).toBeGreaterThan(waiting);
    expect(crossoverWaiting).toBeGreaterThan(scheduled);
    expect(crossoverScheduled).toBeGreaterThan(crossoverWaiting);
    expect(conference).toBeGreaterThan(crossoverScheduled);
    expect(governor).toBeGreaterThan(conference);
  });
});

describe('STATUS_TO_SIMPLIFIED', () => {
  it('maps every board BillStatus to a valid simplified column', () => {
    const simplifiedIds = new Set(SIMPLIFIED_COLUMNS.map((c) => c.id));
    const allStatuses = [
      'introduced', 'scheduled1', 'scheduled2', 'scheduled3',
      'waiting2', 'waiting3', 'deferred1', 'deferred2', 'deferred3',
      'crossoverWaiting1', 'crossoverWaiting2', 'crossoverWaiting3',
      'crossoverScheduled1', 'crossoverScheduled2', 'crossoverScheduled3',
      'crossoverDeferred1', 'crossoverDeferred2', 'crossoverDeferred3',
      'passedCommittees', 'conferenceAssigned', 'conferenceScheduled',
      'conferenceDeferred', 'conferencePassed', 'transmittedGovernor',
      'vetoList', 'governorSigns', 'lawWithoutSignature',
    ];

    for (const status of allStatuses) {
      expect(STATUS_TO_SIMPLIFIED[status]).toBeDefined();
      expect(simplifiedIds.has(STATUS_TO_SIMPLIFIED[status])).toBe(true);
    }
  });

  it('does not surface unassigned bills on the simplified board', () => {
    const simplifiedIds = new Set(SIMPLIFIED_COLUMNS.map((c) => c.id));
    expect(simplifiedIds.has(STATUS_TO_SIMPLIFIED['unassigned'])).toBe(false);
  });

  it('maps waiting statuses to simpleWaiting', () => {
    expect(STATUS_TO_SIMPLIFIED['introduced']).toBe('simpleWaiting');
    expect(STATUS_TO_SIMPLIFIED['waiting2']).toBe('simpleWaiting');
    expect(STATUS_TO_SIMPLIFIED['waiting3']).toBe('simpleWaiting');
  });

  it('maps scheduled and deferred statuses to simpleScheduled', () => {
    expect(STATUS_TO_SIMPLIFIED['scheduled1']).toBe('simpleScheduled');
    expect(STATUS_TO_SIMPLIFIED['scheduled2']).toBe('simpleScheduled');
    expect(STATUS_TO_SIMPLIFIED['scheduled3']).toBe('simpleScheduled');
    expect(STATUS_TO_SIMPLIFIED['deferred1']).toBe('simpleScheduled');
    expect(STATUS_TO_SIMPLIFIED['deferred2']).toBe('simpleScheduled');
    expect(STATUS_TO_SIMPLIFIED['deferred3']).toBe('simpleScheduled');
  });

  it('maps crossover waiting statuses to simpleCrossoverWaiting', () => {
    expect(STATUS_TO_SIMPLIFIED['crossoverWaiting1']).toBe('simpleCrossoverWaiting');
    expect(STATUS_TO_SIMPLIFIED['crossoverWaiting2']).toBe('simpleCrossoverWaiting');
    expect(STATUS_TO_SIMPLIFIED['crossoverWaiting3']).toBe('simpleCrossoverWaiting');
  });

  it('maps crossover scheduled and deferred statuses to simpleCrossoverScheduled', () => {
    expect(STATUS_TO_SIMPLIFIED['crossoverScheduled1']).toBe('simpleCrossoverScheduled');
    expect(STATUS_TO_SIMPLIFIED['crossoverScheduled2']).toBe('simpleCrossoverScheduled');
    expect(STATUS_TO_SIMPLIFIED['crossoverScheduled3']).toBe('simpleCrossoverScheduled');
    expect(STATUS_TO_SIMPLIFIED['crossoverDeferred1']).toBe('simpleCrossoverScheduled');
    expect(STATUS_TO_SIMPLIFIED['crossoverDeferred2']).toBe('simpleCrossoverScheduled');
    expect(STATUS_TO_SIMPLIFIED['crossoverDeferred3']).toBe('simpleCrossoverScheduled');
  });

  it('maps conference and governor statuses to themselves', () => {
    expect(STATUS_TO_SIMPLIFIED['passedCommittees']).toBe('passedCommittees');
    expect(STATUS_TO_SIMPLIFIED['conferenceAssigned']).toBe('conferenceAssigned');
    expect(STATUS_TO_SIMPLIFIED['conferenceScheduled']).toBe('conferenceScheduled');
    expect(STATUS_TO_SIMPLIFIED['conferenceDeferred']).toBe('conferenceScheduled');
    expect(STATUS_TO_SIMPLIFIED['conferencePassed']).toBe('conferencePassed');
    expect(STATUS_TO_SIMPLIFIED['transmittedGovernor']).toBe('transmittedGovernor');
    expect(STATUS_TO_SIMPLIFIED['vetoList']).toBe('vetoList');
    expect(STATUS_TO_SIMPLIFIED['governorSigns']).toBe('governorSigns');
    expect(STATUS_TO_SIMPLIFIED['lawWithoutSignature']).toBe('lawWithoutSignature');
  });
});

describe('isAwaitingHearing', () => {
  it('is true for every pre-hearing waiting status', () => {
    for (const status of AWAITING_HEARING_STATUSES) {
      expect(isAwaitingHearing(status)).toBe(true);
    }
  });

  it('is false for scheduled, conference, and terminal statuses', () => {
    for (const status of ['scheduled1', 'crossoverScheduled2', 'passedCommittees', 'conferenceAssigned', 'transmittedGovernor', 'governorSigns', 'unassigned']) {
      expect(isAwaitingHearing(status)).toBe(false);
    }
  });

  it('is false for null/undefined', () => {
    expect(isAwaitingHearing(null)).toBe(false);
    expect(isAwaitingHearing(undefined)).toBe(false);
  });

  it('every awaiting status is a real detailed column', () => {
    for (const status of AWAITING_HEARING_STATUSES) {
      expect(KANBAN_COLUMNS.some((c) => c.id === status), `${status} is not a column`).toBe(true);
    }
  });
});

describe('COLUMN_DESCRIPTIONS', () => {
  it('has a non-empty description for every detailed column', () => {
    for (const col of KANBAN_COLUMNS) {
      expect(COLUMN_DESCRIPTIONS[col.id], `missing description for ${col.id}`).toBeTruthy();
    }
  });

  it('has a non-empty description for every simplified column', () => {
    for (const col of SIMPLIFIED_COLUMNS) {
      expect(COLUMN_DESCRIPTIONS[col.id], `missing description for ${col.id}`).toBeTruthy();
    }
  });
});
