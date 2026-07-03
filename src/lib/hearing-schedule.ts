// ==============================================
// HEARING SCHEDULE — pure parsing of scraped hearing notices
// ==============================================
// Hearing datetimes live inside scraped status-update text, e.g.
//   "Bill scheduled to be heard by HSG on Friday, 01-31-25 9:15AM in ..."
//   "The committee(s) on HRE has scheduled a public hearing on 03-13-25 3:05PM; ..."
// Testimony is due 24 hours before the hearing, so the countdown targets
// hearing time minus 24h.

const HEARING_DATETIME_PATTERN =
  /(\d{1,2})-(\d{1,2})-(\d{2,4})[,\s]+(?:at\s+)?(\d{1,2}):(\d{2})\s*([AP])\.?M\.?/i;

const HOUR_MS = 60 * 60 * 1000;
const TESTIMONY_WINDOW_MS = 24 * HOUR_MS;

/**
 * Extracts the hearing datetime from a scraped status-update text.
 * Returns null when the text carries no recognizable hearing datetime.
 */
export function parseHearingDatetime(statusText: string): Date | null {
  const match = statusText.match(HEARING_DATETIME_PATTERN);
  if (!match) return null;

  const [, monthStr, dayStr, yearStr, hourStr, minuteStr, meridiem] = match;
  const year = yearStr.length === 2 ? 2000 + Number(yearStr) : Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const minute = Number(minuteStr);
  let hour = Number(hourStr) % 12;
  if (meridiem.toUpperCase() === 'P') hour += 12;

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(year, month - 1, day, hour, minute);
}

/**
 * Countdown label for the testimony deadline (hearing minus 24 hours):
 * 'due in Nh' (or 'due in Nd' beyond 48h), 'due now' inside the 24-hour
 * window, and null once the hearing has started or passed.
 */
export function getTestimonyCountdownLabel(hearingAt: Date, now: Date): string | null {
  const nowMs = now.getTime();
  if (nowMs >= hearingAt.getTime()) return null;

  const msUntilDeadline = hearingAt.getTime() - TESTIMONY_WINDOW_MS - nowMs;
  if (msUntilDeadline <= 0) return 'due now';

  const hours = Math.ceil(msUntilDeadline / HOUR_MS);
  if (hours > 48) return `due in ${Math.ceil(hours / 24)}d`;
  return `due in ${hours}h`;
}
