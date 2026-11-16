import { describe, it, expect } from 'vitest';
import { buildReadingSteps, type ReadingInput } from '../bills/bill-reading-steps';
import { buildSpotlightSteps } from '../bills/bill-spotlight-steps';

const input: ReadingInput = {
  billNumber: 'HB100',
  billTitle: 'RELATING TO FARMS',
  introducer: 'SAYAMA',
  committeeAssignment: 'AGR, FIN',
  latestVersionLabel: 'HB100_HD1',
  currentStatus: 'scheduled1',
  deadlineName: 'First Decking',
  dead: false,
  committeeNames: { AGR: 'Agriculture', FIN: 'Finance' },
};

const build = (over: Partial<ReadingInput> = {}) =>
  buildSpotlightSteps(buildReadingSteps({ ...input, ...over }));

describe('buildSpotlightSteps', () => {
  it('walks the dialog in reading order, ending with the actions', () => {
    const ids = build().map((s) => s.id);
    expect(ids[0]).toBe('number');
    expect(ids[ids.length - 1]).toBe('actions');
    expect(ids).toEqual([
      'number', 'title', 'stage', 'standing', 'committees', 'version', 'introducers', 'updates', 'actions',
    ]);
  });

  it('carries the bill’s real values through', () => {
    const steps = build();
    expect(steps.find((s) => s.id === 'number')?.value).toBe('HB100');
    expect(steps.find((s) => s.id === 'committees')?.value).toBe('AGR, FIN');
    expect(steps.find((s) => s.id === 'version')?.value).toBe('HB100_HD1');
  });

  it('folds the next deadline into the standing step', () => {
    const standing = build().find((s) => s.id === 'standing')!;
    expect(standing.body).toContain('Next deadline, First Decking');
  });

  it('uses fixed copy for the progress bar when a bill has no stage', () => {
    const stage = build({ dead: true }).find((s) => s.id === 'stage')!;
    expect(stage.value).toBeNull();
    expect(stage.body.length).toBeGreaterThan(0);
  });

  it('omits parts the bill lacks but always keeps number, updates and actions', () => {
    const ids = build({ billTitle: null, introducer: null, committeeAssignment: null, latestVersionLabel: null })
      .map((s) => s.id);
    expect(ids).toContain('number');
    expect(ids).toContain('updates');
    expect(ids).toContain('actions');
    expect(ids).not.toContain('title');
    expect(ids).not.toContain('committees');
    expect(ids).not.toContain('introducers');
  });

  it('gives every step a target, label and body', () => {
    for (const s of build()) {
      expect(s.target).toBeTruthy();
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.body.length).toBeGreaterThan(0);
    }
  });
});
