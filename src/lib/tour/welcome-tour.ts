/**
 * First-visit welcome tour — pure data and rules. The DOM side (spotlight,
 * positioning, persistence) lives in components/tour/welcome-tour.tsx.
 */

/** localStorage flag. Bump the suffix to re-show the tour after a big redesign. */
export const TOUR_STORAGE_KEY = 'billtracker:welcome-tour-v1';

/** Window event that (re)starts the tour from anywhere, e.g. the Guide page. */
export const TOUR_START_EVENT = 'billtracker:start-tour';

export interface TourStep {
  id: string;
  title: string;
  body: string;
  /** NAV_ITEMS href to spotlight. Omitted = centered card with no spotlight. */
  target?: string;
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to the Hawaiʻi Bill Tracker',
    body: 'Follow the bills that matter to you and speak up on them. This 30-second tour shows you around.',
  },
  {
    id: 'discover',
    target: '/discover',
    title: 'Discover',
    body: 'Search every bill by number, title, or topic. Use the filters to narrow results, then press Track on the ones you care about.',
  },
  {
    id: 'your-bills',
    target: '/your-bills',
    title: 'Your Bills',
    body: 'Tracked bills show up here. See them as a Kanban board, a spreadsheet, or a calendar of key dates.',
  },
  {
    id: 'testimonies',
    target: '/testimonies',
    title: 'Testimonies',
    body: 'Write, review, and submit testimony on a bill. Drafts and submitted testimony are saved here.',
  },
  {
    id: 'boards',
    target: '/boards',
    title: 'Active Boards',
    body: 'Browse the bills other organizations are tracking (view only).',
  },
  {
    id: 'guide',
    target: '/guide',
    title: 'Guide',
    body: 'Come back to the Guide any time for a quick reference. You can replay this tour from there too.',
  },
];

/** Paths that count as "initial landing" for auto-starting the tour. */
const LANDING_PATHS: ReadonlySet<string> = new Set(['/', '/discover']);

/** Auto-start only on the landing pages, and only if the user hasn't finished or skipped it. */
export function shouldAutoStartTour(pathname: string, seen: boolean): boolean {
  return !seen && LANDING_PATHS.has(pathname);
}

/**
 * Optional short screen recordings, one per tour step, served from
 * public/tutorial/<step id>.mp4 (and .webm). A step whose file is missing simply
 * shows no video. Expected files: discover, your-bills, testimonies, boards, guide.
 */
export const TUTORIAL_VIDEO_DIR = '/tutorial';

export interface TutorialVideoSource {
  src: string;
  type: string;
}

/** Sources to offer the browser for a step's clip, preferred format first. */
export function tutorialVideoSources(name: string): TutorialVideoSource[] {
  return [
    { src: `${TUTORIAL_VIDEO_DIR}/${name}.mp4`, type: 'video/mp4' },
    { src: `${TUTORIAL_VIDEO_DIR}/${name}.webm`, type: 'video/webm' },
  ];
}
