/** Pure rule for when the post-tour interest picker auto-opens. */
export function shouldOpenInterestPicker(s: {
  signedIn: boolean;
  preferences: { onboarded_at: string | null } | null;
  tourRunning: boolean;
}): boolean {
  return s.signedIn && s.preferences !== null && s.preferences.onboarded_at === null && !s.tourRunning;
}
