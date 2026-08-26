import { describe, it, expect } from 'vitest';
import { parseConferees } from '@/lib/testimony/conferees';
import type { StatusLine } from '@/lib/testimony/committees';

/** Convenience: wrap raw status strings as the StatusLine[] the parser reads. */
function lines(...texts: string[]): StatusLine[] {
  return texts.map((statustext) => ({ statustext }));
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
});
