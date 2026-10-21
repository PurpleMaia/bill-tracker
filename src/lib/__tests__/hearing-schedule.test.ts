import { describe, it, expect } from 'vitest';
import { parseHearingDatetime, getTestimonyCountdownLabel, getTestimonyDeadline } from '@/lib/testimony/hearing-schedule';

describe('parseHearingDatetime', () => {
  it('parses house hearing notices (MM-DD-YY H:MMAM)', () => {
    expect(
      parseHearingDatetime(
        'Bill scheduled to be heard by HSG on Friday, 01-31-25 9:15AM in House conference room 430 VIA VIDEOCONFERENCE.',
      ),
    ).toEqual(new Date(2025, 0, 31, 9, 15));
  });

  it('parses senate committee notices with PM times', () => {
    expect(
      parseHearingDatetime(
        'The committee(s) on HRE has scheduled a public hearing on 03-13-25 3:05PM; Conference Room 229 & Videoconference.',
      ),
    ).toEqual(new Date(2025, 2, 13, 15, 5));
  });

  it('parses conference committee meetings', () => {
    expect(
      parseHearingDatetime('Conference committee meeting scheduled for 04-22-25 1:30PM; Conference Room 229.'),
    ).toEqual(new Date(2025, 3, 22, 13, 30));
  });

  it('parses 4-digit years and "at" with spaced meridiem', () => {
    expect(
      parseHearingDatetime('The committee(s) on WAM will hold a public decision making on 02-13-2026 at 1:30 PM.'),
    ).toEqual(new Date(2026, 1, 13, 13, 30));
  });

  it('handles 12AM and 12PM correctly', () => {
    expect(parseHearingDatetime('hearing on 02-01-26 12:00PM')).toEqual(new Date(2026, 1, 1, 12, 0));
    expect(parseHearingDatetime('hearing on 02-01-26 12:15AM')).toEqual(new Date(2026, 1, 1, 0, 15));
  });

  it('returns null when no hearing datetime is present', () => {
    expect(parseHearingDatetime('Passed Second Reading and referred to the committee(s) on WAM.')).toBeNull();
    expect(parseHearingDatetime('Received from the House (Hse. Com. No. 111).')).toBeNull();
  });
});

describe('getTestimonyCountdownLabel', () => {
  const hearing = new Date(2026, 6, 4, 10, 0); // Jul 4 2026, 10:00

  it('counts down to the 24-hours-before deadline in hours', () => {
    expect(getTestimonyCountdownLabel(hearing, new Date(2026, 6, 2, 20, 0))).toBe('due in 14h');
  });

  it('uses days when the deadline is more than 48 hours away', () => {
    expect(getTestimonyCountdownLabel(hearing, new Date(2026, 6, 1, 4, 0))).toBe('due in 3d');
  });

  it('says due now inside the 24-hour window', () => {
    expect(getTestimonyCountdownLabel(hearing, new Date(2026, 6, 3, 12, 0))).toBe('due now');
  });

  it('returns null once the hearing has started or passed', () => {
    expect(getTestimonyCountdownLabel(hearing, new Date(2026, 6, 4, 10, 0))).toBeNull();
    expect(getTestimonyCountdownLabel(hearing, new Date(2026, 6, 5, 9, 0))).toBeNull();
  });
});

describe('getTestimonyDeadline', () => {
  const notice = 'Bill scheduled to be heard by AGR on 07-04-26 10:00AM in conference room 312.';
  const hearing = new Date(2026, 6, 4, 10, 0);

  it('returns the full picture for a scheduled bill with an upcoming hearing', () => {
    const result = getTestimonyDeadline({
      billStatus: 'scheduled1',
      latestStatusText: notice,
      now: new Date(2026, 6, 1, 4, 0),
    });
    expect(result).toEqual({
      hearingAt: hearing,
      countdown: 'due in 3d',
      urgent: false,
      hearingPassed: false,
    });
  });

  it('flags urgency when the deadline is within 48 hours', () => {
    const result = getTestimonyDeadline({
      billStatus: 'scheduled1',
      latestStatusText: notice,
      now: new Date(2026, 6, 2, 20, 0),
    });
    expect(result.countdown).toBe('due in 14h');
    expect(result.urgent).toBe(true);
  });

  it('reports hearingPassed once the hearing has started', () => {
    const result = getTestimonyDeadline({
      billStatus: 'scheduled1',
      latestStatusText: notice,
      now: new Date(2026, 6, 4, 10, 0),
    });
    expect(result).toEqual({ hearingAt: hearing, countdown: null, urgent: false, hearingPassed: true });
  });

  it('returns nothing for non-scheduled statuses or missing notices', () => {
    const empty = { hearingAt: null, countdown: null, urgent: false, hearingPassed: false };
    expect(
      getTestimonyDeadline({ billStatus: 'introduced', latestStatusText: notice, now: hearing }),
    ).toEqual(empty);
    expect(
      getTestimonyDeadline({ billStatus: 'scheduled1', latestStatusText: null, now: hearing }),
    ).toEqual(empty);
  });

  // A committee that has issued a recommendation ("PASSED"/"DEFERRED") advances the
  // bill to a waiting/deferred status, so it is no longer a scheduled status. But its
  // status text still carries the (now past) hearing notice — testimony for that
  // hearing must close.
  const passedNotice =
    'The committee(s) on SIM-JHA recommend(s) that the measure be PASSED, unamended. ' +
    'The committee(s) on SIM-JHA has scheduled a public hearing on 08-31-26 2:00PM.';

  it('closes testimony when a committee recommended PASSED and its hearing has passed', () => {
    const result = getTestimonyDeadline({
      billStatus: 'waiting2',
      latestStatusText: passedNotice,
      now: new Date(2026, 8, 1, 9, 0), // Sep 1 2026 — after the Aug 31 hearing
    });
    expect(result).toEqual({
      hearingAt: new Date(2026, 7, 31, 14, 0),
      countdown: null,
      urgent: false,
      hearingPassed: true,
    });
  });

  it('does not close testimony when the recommended committee hearing is still upcoming', () => {
    // A stale recommendation notice whose parsed hearing date is in the future does
    // not close testimony — the past-date check must gate it.
    const result = getTestimonyDeadline({
      billStatus: 'waiting2',
      latestStatusText: passedNotice,
      now: new Date(2026, 7, 30, 9, 0), // Aug 30 2026 — before the Aug 31 hearing
    });
    expect(result.hearingPassed).toBe(false);
  });

  it('does not treat a plain "waiting" bill with no recommendation as hearing-passed', () => {
    const result = getTestimonyDeadline({
      billStatus: 'waiting2',
      latestStatusText: 'Passed Second Reading and referred to the committee(s) on WAM.',
      now: hearing,
    });
    expect(result).toEqual({ hearingAt: null, countdown: null, urgent: false, hearingPassed: false });
  });

  it('closes testimony when a committee recommended DEFERRED and its hearing has passed', () => {
    const deferredNotice =
      'The committee(s) on WAM recommend(s) that the measure be DEFERRED. ' +
      'The committee(s) on WAM has scheduled a public hearing on 08-31-26 2:00PM.';
    const result = getTestimonyDeadline({
      billStatus: 'deferred2',
      latestStatusText: deferredNotice,
      now: new Date(2026, 8, 1, 9, 0),
    });
    expect(result.hearingPassed).toBe(true);
  });
});
