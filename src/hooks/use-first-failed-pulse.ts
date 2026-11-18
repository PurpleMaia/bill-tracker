import { useEffect, useState } from 'react';

const STORAGE_KEY = 'foodplus:failed-why-seen';

/**
 * True once per browser: the first time a failed card's "Why?" pill mounts.
 * Marks it seen in localStorage right away, so later cards (and reloads) don't
 * pulse. If storage is unavailable, there's simply no pulse.
 */
export function useFirstFailedPulse(): boolean {
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === null) {
        localStorage.setItem(STORAGE_KEY, '1');
        setPulse(true);
      }
    } catch {
      // Storage blocked (private window, disabled site data): no pulse.
    }
  }, []);
  return pulse;
}
