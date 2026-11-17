import { LIVE_SESSION_YEARS } from '@/lib/bills/search-params';

/** current_committee is only maintained for live sessions; any other year is NULL. */
export function currentCommitteeForYear(
  year: number | null,
  step: string[] | null,
): string[] | null {
  return year !== null && LIVE_SESSION_YEARS.includes(year) ? step : null;
}
