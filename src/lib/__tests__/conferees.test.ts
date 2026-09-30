import { describe, it, expect } from 'vitest';
import { parseConferees } from '@/lib/testimony/conferees';
import type { StatusLine } from '@/lib/testimony/committees';

/** Convenience: wrap raw status strings as the StatusLine[] the parser reads. */
function lines(...texts: string[]): StatusLine[] {
  return texts.map((statustext) => ({ statustext }));
}

/** Wrap dated [date, text] pairs — the parser sorts by date before parsing. */
function dated(...pairs: [string, string][]): Array<{ date: string; statustext: string }> {
  return pairs.map(([date, statustext]) => ({ date, statustext }));
}

describe('parseConferees', () => {
  it('parses the real capitol format, splitting on ; and , and stripping role markers', () => {
    const result = parseConferees(
      lines('House Conferees Appointed: Sayama, Lee, M. Co-Chairs; Reyes Oda.'),
    );
    // Three people: "Sayama", "Lee, M." (an initialed surname), "Reyes Oda"
    // (multi-word). "Co-Chairs" is a role marker, not a name.
    expect(result).toEqual([
      { surname: 'Sayama', chamber: 'House', isChair: true },
      { surname: 'Lee, M.', chamber: 'House', isChair: true },
      { surname: 'Reyes Oda', chamber: 'House', isChair: false },
    ]);
  });

  it('parses both chambers when both appear', () => {
    const result = parseConferees(
      lines(
        'House Conferees Appointed: Sayama, Co-Chair; Reyes Oda.',
        'Senate Conferees Appointed: Keohokalole, Chair; Fevella.',
      ),
    );
    expect(result).toEqual([
      { surname: 'Sayama', chamber: 'House', isChair: true },
      { surname: 'Reyes Oda', chamber: 'House', isChair: false },
      { surname: 'Keohokalole', chamber: 'Senate', isChair: true },
      { surname: 'Fevella', chamber: 'Senate', isChair: false },
    ]);
  });

  it('supersedes an earlier appointment with a later re-appointment for the same chamber', () => {
    const result = parseConferees(
      lines(
        'House Conferees Appointed: Sayama, Chair; Oldmember.',
        'Some unrelated status line.',
        'House Conferees Appointed: Sayama, Chair; Newmember.',
      ),
    );
    expect(result).toEqual([
      { surname: 'Sayama', chamber: 'House', isChair: true },
      { surname: 'Newmember', chamber: 'House', isChair: false },
    ]);
  });

  it('marks only the members preceding a Chair/Co-Chair marker as chairs', () => {
    // "A, B Co-Chairs; C" -> A and B are co-chairs, C is not.
    const result = parseConferees(lines('House Conferees Appointed: Aaa, Bbb Co-Chairs; Ccc.'));
    expect(result).toEqual([
      { surname: 'Aaa', chamber: 'House', isChair: true },
      { surname: 'Bbb', chamber: 'House', isChair: true },
      { surname: 'Ccc', chamber: 'House', isChair: false },
    ]);
  });

  it('handles a single-conferee roster', () => {
    expect(parseConferees(lines('Senate Conferees Appointed: Rhoads, Chair.'))).toEqual([
      { surname: 'Rhoads', chamber: 'Senate', isChair: true },
    ]);
  });

  it('returns [] when no appointment line is present', () => {
    expect(parseConferees(lines('Passed Second Reading and referred to WAM.'))).toEqual([]);
    expect(parseConferees([])).toEqual([]);
    expect(parseConferees(lines('The conference committee will be scheduled.'))).toEqual([]);
  });

  it('is tolerant of extra whitespace and a missing trailing period', () => {
    expect(
      parseConferees(lines('House Conferees Appointed:   Sayama ,  Chair ;  Reyes Oda ')),
    ).toEqual([
      { surname: 'Sayama', chamber: 'House', isChair: true },
      { surname: 'Reyes Oda', chamber: 'House', isChair: false },
    ]);
  });

  it('parses an "Added" line naming a single legislator with a title prefix', () => {
    // "Representative Garcia added as Conferee." — a different verb ("Added"),
    // a title prefix, and a sentence rather than a roster.
    expect(
      parseConferees(lines('House Conferees Added: Representative Garcia added as Conferee.')),
    ).toEqual([{ surname: 'Garcia', chamber: 'House', isChair: false }]);
  });

  it('strips the Senator title prefix on an "Added" line', () => {
    expect(
      parseConferees(lines('Senate Conferees Added: Senator Rhoads added as Conferee.')),
    ).toEqual([{ surname: 'Rhoads', chamber: 'Senate', isChair: false }]);
  });

  it('marks an "Added" conferee as chair when the line says Co-Chair', () => {
    expect(
      parseConferees(lines('House Conferees Added: Representative Garcia added as Co-Chair.')),
    ).toEqual([{ surname: 'Garcia', chamber: 'House', isChair: true }]);
  });

  it('APPENDS an "Added" conferee to an earlier appointed roster for the same chamber', () => {
    const result = parseConferees(
      lines(
        'House Conferees Appointed: Sayama, Chair; Reyes Oda.',
        'House Conferees Added: Representative Garcia added as Conferee.',
      ),
    );
    expect(result).toEqual([
      { surname: 'Sayama', chamber: 'House', isChair: true },
      { surname: 'Reyes Oda', chamber: 'House', isChair: false },
      { surname: 'Garcia', chamber: 'House', isChair: false },
    ]);
  });

  it('does not duplicate a conferee already on the roster when re-added', () => {
    const result = parseConferees(
      lines(
        'House Conferees Appointed: Garcia, Chair.',
        'House Conferees Added: Representative Garcia added as Conferee.',
      ),
    );
    expect(result).toEqual([{ surname: 'Garcia', chamber: 'House', isChair: true }]);
  });

  it('handles multiple names on a single "Added" line', () => {
    expect(
      parseConferees(
        lines('House Conferees Added: Representatives Garcia, Lee added as Conferees.'),
      ),
    ).toEqual([
      { surname: 'Garcia', chamber: 'House', isChair: false },
      { surname: 'Lee', chamber: 'House', isChair: false },
    ]);
  });

  it('appends an "Added" member even when updates arrive newest-first (production order)', () => {
    // The DB returns status updates date-DESC, so the newer "Added" line comes
    // BEFORE the older "Appointed" line in the array. parseConferees must sort by
    // date so the append lands on the appointed roster, not an empty one.
    const result = parseConferees(
      dated(
        ['4/20/2026', 'House Conferees Added: Representative Garcia added as Conferee.'],
        ['4/15/2026', 'House Conferees Appointed: Sayama, Chair; Reyes Oda.'],
      ),
    );
    expect(result).toEqual([
      { surname: 'Sayama', chamber: 'House', isChair: true },
      { surname: 'Reyes Oda', chamber: 'House', isChair: false },
      { surname: 'Garcia', chamber: 'House', isChair: false },
    ]);
  });

  it('lets the latest appointment win when updates arrive newest-first (production order)', () => {
    // Newest-first array: the newer re-appointment (Newmember) is first. Sorting
    // by date ascending makes the LATER appointment win the replace, as intended.
    const result = parseConferees(
      dated(
        ['4/20/2026', 'House Conferees Appointed: Sayama, Chair; Newmember.'],
        ['4/15/2026', 'House Conferees Appointed: Sayama, Chair; Oldmember.'],
      ),
    );
    expect(result).toEqual([
      { surname: 'Sayama', chamber: 'House', isChair: true },
      { surname: 'Newmember', chamber: 'House', isChair: false },
    ]);
  });
});
