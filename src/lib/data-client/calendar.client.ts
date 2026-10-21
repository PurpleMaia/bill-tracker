import { defineClient } from './define-client';
import { getCalendarUpdatesAction } from '@/app/actions/calendar';
import type { MilestoneUpdate } from '@/lib/calendar/bill-milestones';

async function getCalendarUpdatesFetch(billIds: string[]): Promise<Record<string, MilestoneUpdate[]>> {
  const res = await fetch('/api/calendar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ billIds }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load calendar data');
  }
  const data = await res.json();
  return (data.updates ?? {}) as Record<string, MilestoneUpdate[]>;
}

export const calendarClient = defineClient('calendar', {
  getUpdates: { action: getCalendarUpdatesAction, fetch: getCalendarUpdatesFetch },
});
