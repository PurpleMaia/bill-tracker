import { describe, it, expect } from 'vitest';
import {
  CONTACT_WALKTHROUGH_KEY,
  REQUESTS_MATTER,
  TESTIMONY_WALKTHROUGH_KEY,
  contactWalkthrough,
  testimonyWalkthrough,
  type ContactStage,
} from '../tour/flow-walkthroughs';

const STAGES: ContactStage[] = ['hearing', 'conference', 'governor', 'intentToVeto', 'override'];

describe('testimonyWalkthrough', () => {
  const w = testimonyWalkthrough({ billNumber: 'HB123' });

  it('uses the real bill number', () => {
    expect(w.goal).toContain('HB123');
  });
  it('states that the app cannot submit testimony', () => {
    expect(w.caveat.title).toMatch(/cannot submit/i);
    expect(w.caveat.body).toContain('capitol.hawaii.gov');
  });
  it('tells the user to come back and mark it submitted', () => {
    expect(w.next).toMatch(/I submitted it on the Capitol site/);
  });
  it('spotlights the editor and ends on the replay button', () => {
    expect(w.steps.map((s) => s.target)).toContain('editor');
    expect(w.steps.at(-1)?.target).toBe('help');
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
    expect(new Set(w.steps.map((s) => s.target)).size).toBe(w.steps.length);
    expect(w.steps.map((s) => s.target)).toEqual(expect.arrayContaining(['goal', 'reference', 'email', 'call', 'help']));
  });

  it('hearing: asks for a hearing or a meeting, naming the committee', () => {
    const w = contactWalkthrough({ stage: 'hearing', billNumber: 'SB45', committeeName: 'Committee on Agriculture' });
    expect(w.goal).toContain('Committee on Agriculture');
    expect(w.goal).toMatch(/hearing/);
    expect(w.goal).toMatch(/meet/);
  });

  it('hearing: highlights that more requests make a hearing more likely', () => {
    const w = contactWalkthrough({ stage: 'hearing', billNumber: 'SB45' });
    expect(w.emphasis).toBe(REQUESTS_MATTER);
  });

  it('hearing: spotlights the committee holding the bill, then the rest of its path', () => {
    const targets = contactWalkthrough({ stage: 'hearing', billNumber: 'SB45' }).steps.map((s) => s.target);
    expect(targets.indexOf('committee')).toBeGreaterThan(-1);
    expect(targets.indexOf('other-committees')).toBe(targets.indexOf('committee') + 1);
    const committee = contactWalkthrough({ stage: 'hearing', billNumber: 'SB45' }).steps.find((s) => s.target === 'committee');
    expect(committee?.body).toMatch(/top committee/i);
  });

  it('hearing: names a bare committee as a committee', () => {
    const w = contactWalkthrough({ stage: 'hearing', billNumber: 'SB45', committeeName: 'Health' });
    expect(w.goal).toContain('the Health committee');
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

describe('every walkthrough', () => {
  const all = [
    testimonyWalkthrough({ billNumber: 'HB123' }),
    ...STAGES.map((stage) => contactWalkthrough({ stage, billNumber: 'SB45' })),
  ];
  it.each(all.map((w) => [w.title, w] as const))('%s: describes the page, not a made-up person', (_title, w) => {
    const text = JSON.stringify(w);
    expect(text).not.toMatch(/\bKai\b/);
  });
});

describe('caveat placement', () => {
  it('testimony leads with the caveat; contact tours put it under the goal', () => {
    expect(testimonyWalkthrough({ billNumber: 'HB123' }).caveatFirst).toBe(true);
    for (const stage of STAGES) {
      expect(contactWalkthrough({ stage, billNumber: 'SB45' }).caveatFirst).toBeFalsy();
    }
  });
});

describe('walkthrough storage keys', () => {
  it('are distinct per flow', () => {
    expect(TESTIMONY_WALKTHROUGH_KEY).not.toBe(CONTACT_WALKTHROUGH_KEY);
  });
});
