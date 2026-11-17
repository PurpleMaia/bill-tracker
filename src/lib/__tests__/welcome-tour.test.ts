import { describe, it, expect } from 'vitest';
import {
  TOUR_STEPS,
  shouldAutoStartTour,
  tourStepPath,
  tutorialVideoSources,
} from '../tour/welcome-tour';

describe('shouldAutoStartTour', () => {
  it('starts on the landing pages for a first-time visitor', () => {
    expect(shouldAutoStartTour('/', false)).toBe(true);
    expect(shouldAutoStartTour('/discover', false)).toBe(true);
  });
  it('does not start once the tour has been seen', () => {
    expect(shouldAutoStartTour('/', true)).toBe(false);
    expect(shouldAutoStartTour('/discover', true)).toBe(false);
  });
  it('does not interrupt deep links', () => {
    expect(shouldAutoStartTour('/your-bills', false)).toBe(false);
    expect(shouldAutoStartTour('/testimonies/drafts', false)).toBe(false);
    expect(shouldAutoStartTour('/guide', false)).toBe(false);
  });
});

describe('TOUR_STEPS', () => {
  it('has unique ids', () => {
    const ids = TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('opens with a centered welcome step', () => {
    expect(TOUR_STEPS[0].target).toBeUndefined();
  });
  it('keeps the tour short', () => {
    expect(TOUR_STEPS.length).toBeLessThanOrEqual(7);
  });
});

describe('tutorialVideoSources', () => {
  it('offers mp4 first, then webm, under /tutorial', () => {
    expect(tutorialVideoSources('discover')).toEqual([
      { src: '/tutorial/discover.mp4', type: 'video/mp4' },
      { src: '/tutorial/discover.webm', type: 'video/webm' },
    ]);
  });
});

describe('tourStepPath', () => {
  const step = (id: string) => TOUR_STEPS.find((s) => s.id === id)!;

  it('walks to the page a step describes', () => {
    expect(tourStepPath(step('your-bills'), '/discover')).toBe('/your-bills');
    expect(tourStepPath(step('discover'), '/your-bills')).toBe('/discover');
    expect(tourStepPath(step('boards'), '/testimonies')).toBe('/boards');
  });
  it('stays put when already on that page or a sub-page', () => {
    expect(tourStepPath(step('your-bills'), '/your-bills')).toBeNull();
    expect(tourStepPath(step('boards'), '/boards/browse')).toBeNull();
    expect(tourStepPath(step('discover'), '/')).toBeNull();
  });
  it('does not treat a shared prefix as the same page', () => {
    expect(tourStepPath({ id: 'x', title: '', body: '', target: '/bill' }, '/bills')).toBe('/bill');
  });
  it('leaves the centered welcome step where it is', () => {
    expect(tourStepPath(step('welcome'), '/guide')).toBeNull();
  });
});
