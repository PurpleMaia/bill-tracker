import { describe, it, expect } from 'vitest';
import { parseHearingDatetime, getTestimonyCountdownLabel } from '@/lib/hearing-schedule';

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
