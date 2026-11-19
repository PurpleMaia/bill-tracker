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
    expect(shouldAutoStartTour('/find-bills', false)).toBe(true);
  });
  it('does not start once the tour has been seen', () => {
    expect(shouldAutoStartTour('/', true)).toBe(false);
    expect(shouldAutoStartTour('/find-bills', true)).toBe(false);
  });
  it('does not interrupt deep links', () => {
    expect(shouldAutoStartTour('/tracker', false)).toBe(false);
    expect(shouldAutoStartTour('/take-action/testimony/drafts', false)).toBe(false);
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
    expect(tourStepPath(step('your-bills'), '/find-bills')).toBe('/tracker');
    expect(tourStepPath(step('discover'), '/tracker')).toBe('/find-bills');
    expect(tourStepPath(step('boards'), '/take-action')).toBe('/community');
  });
  it('stays put when already on that page or a sub-page', () => {
    expect(tourStepPath(step('your-bills'), '/tracker')).toBeNull();
    expect(tourStepPath(step('boards'), '/community/following')).toBeNull();
    expect(tourStepPath(step('discover'), '/')).toBeNull();
  });
  it('does not treat a shared prefix as the same page', () => {
    expect(tourStepPath({ id: 'x', title: '', body: '', target: '/bill' }, '/bills')).toBe('/bill');
  });
  it('leaves the centered welcome step where it is', () => {
    expect(tourStepPath(step('welcome'), '/guide')).toBeNull();
  });
});
