import { describe, it, expect } from 'vitest';
import {
  CONTACT_WALKTHROUGH_KEY,
  TESTIMONY_WALKTHROUGH_KEY,
  contactWalkthrough,
  testimonyWalkthrough,
  type ContactStage,
} from '../tour/flow-walkthroughs';

const STAGES: ContactStage[] = ['hearing', 'conference', 'governor', 'intentToVeto', 'override'];

describe('testimonyWalkthrough', () => {
  const w = testimonyWalkthrough({ billNumber: 'HB123' });

  it('uses the real bill number in the example', () => {
    expect(w.example).toContain('HB123');
  });
  it('states that the app cannot submit testimony', () => {
    expect(w.caveat.title).toMatch(/cannot submit/i);
    expect(w.caveat.body).toContain('capitol.hawaii.gov');
  });
  it('includes the user submitting on the capitol site as a step', () => {
    expect(w.steps.some((s) => /capitol\.hawaii\.gov/.test(s.title))).toBe(true);
  });
  it('has unique step titles', () => {
    const titles = w.steps.map((s) => s.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe('contactWalkthrough', () => {
  it.each(STAGES)('%s: frames the goal as getting someone to act, with the bill number', (stage) => {
    const w = contactWalkthrough({ stage, billNumber: 'SB45' });
    expect(w.goal).toMatch(/to act/);
    expect(w.goal).toContain('SB45');
    expect(w.caveat.title).toMatch(/does not send/i);
    expect(new Set(w.steps.map((s) => s.title)).size).toBe(w.steps.length);
  });

  it('hearing: asks for a hearing or a meeting, naming the committee', () => {
    const w = contactWalkthrough({ stage: 'hearing', billNumber: 'SB45', committeeName: 'Committee on Agriculture' });
    expect(w.goal).toContain('Committee on Agriculture');
    expect(w.goal).toMatch(/hearing/);
    expect(w.goal).toMatch(/meet/);
  });

  it('hearing: falls back to a neutral committee phrase', () => {
    const w = contactWalkthrough({ stage: 'hearing', billNumber: 'SB45' });
    expect(w.goal).toContain('the committee');
    expect(w.goal).not.toContain('undefined');
  });

  it('distinguishes intent-to-veto from awaiting signature', () => {
    expect(contactWalkthrough({ stage: 'intentToVeto', billNumber: 'SB45' }).title).toMatch(/reconsider/);
    expect(contactWalkthrough({ stage: 'governor', billNumber: 'SB45' }).title).toMatch(/sign/);
  });
});

describe('walkthrough storage keys', () => {
  it('are distinct per flow', () => {
    expect(TESTIMONY_WALKTHROUGH_KEY).not.toBe(CONTACT_WALKTHROUGH_KEY);
  });
});
