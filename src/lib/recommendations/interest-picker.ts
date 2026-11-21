import { shouldAutoStartTour } from '@/lib/tour/welcome-tour';

/** Pure rule for when the post-tour interest picker auto-opens. */
export function shouldOpenInterestPicker(s: {
  signedIn: boolean;
  preferences: { onboarded_at: string | null } | null;
  tourRunning: boolean;
}): boolean {
  return s.signedIn && s.preferences !== null && s.preferences.onboarded_at === null && !s.tourRunning;
}

/**
 * Whether the welcome tour should hold the picker back. The picker follows the
 * tour, but only waits for an unseen tour on a page where it actually auto-starts;
 * elsewhere (e.g. a user sent to /tracker after login) it opens rather than
 * waiting for a tour that will never run there.
 */
export function tourBlocksPicker(s: { tourRunning: boolean; tourSeen: boolean; pathname: string }): boolean {
  return s.tourRunning || (!s.tourSeen && shouldAutoStartTour(s.pathname, false));
}
