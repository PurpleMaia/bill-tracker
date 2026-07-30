import type { SessionDeadlines } from '@/lib/bills/dead-bill';
import realDeadlines from '@/data/session-deadlines-2026.json';
import demoDeadlines from '@/data/session-deadlines-demo.json';

/**
 * The session deadline calendar used by UI components.
 *
 * Set NEXT_PUBLIC_DEMO_DEADLINES=1 to swap in the demo calendar, whose dates
 * sit just ahead of "today" so deadline-driven UI states (countdown tiers,
 * urgency chips) are visible outside the real legislative session. The flag
 * is build-time inlined — restart the dev server after changing it.
 *
 * Server scripts (dead-bill sweeps) intentionally keep importing the real
 * calendar directly, so demo mode never changes which bills get marked dead.
 */
export const SESSION_DEADLINES: SessionDeadlines = (
  process.env.NEXT_PUBLIC_DEMO_DEADLINES === '1' ? demoDeadlines : realDeadlines
) as SessionDeadlines;
