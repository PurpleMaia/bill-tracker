// PURE conferee parsing — no DB, no network. Conferees (the negotiators each
// chamber appoints to a conference committee) are never stored as structured
// data; they appear only in free-text status updates like:
//
//   "House Conferees Appointed: Sayama, Lee, M. Co-Chairs; Reyes Oda."
//
// This module extracts the surnames + chamber + chair role from those lines so
// the contact flow can resolve them against the legislators table. Matching to
// email/phone is the resolver's job (src/db/queries/conferees.ts); here we only
// parse text.
import type { StatusLine } from '@/lib/testimony/committees';

export interface ParsedConferee {
  /** Surname as printed, e.g. "Sayama", "Reyes Oda", "Lee, M.". */
  surname: string;
  chamber: 'House' | 'Senate';
  /** True when this member was marked (Co-)Chair of the conference committee. */
  isChair: boolean;
}

/**
 * The bill statuses at which the actionable step is contacting the appointed
 * conferees rather than the committee chairs — the AWAITING COMMITTEES,
 * SCHEDULED, and PASSED CONFERENCE columns.
 *
 * Deliberately EXCLUDES `passedCommittees` (the "CONFERENCE" column that a bill
 * enters right after clearing its committees): at that point no conferees have
 * been appointed yet, so that stage stays on the committee-chair flow.
 * `conferenceDeferred` is included — it maps to the SCHEDULED column and the
 * bill is still in conference.
 */
const CONFERENCE_CONTACT_STATUSES = new Set([
  'conferenceAssigned', // AWAITING COMMITTEES
  'conferenceScheduled', // SCHEDULED
  'conferenceDeferred', // deferred → shown under SCHEDULED
  'conferencePassed', // PASSED CONFERENCE
]);

/**
 * Whether a bill status is one where the contact flow targets conferees. See
 * {@link CONFERENCE_CONTACT_STATUSES} for exactly which statuses qualify.
 */
export function isConferenceStatus(status: string | null | undefined): boolean {
  return typeof status === 'string' && CONFERENCE_CONTACT_STATUSES.has(status);
}

// "House Conferees Appointed: <roster>" — captures chamber + the roster text.
// The roster runs to the end of the line/string; a trailing sentence period is
// stripped in parseRoster. We can't terminate on a bare period because initials
// ("Lee, M.") contain periods mid-roster.
const APPOINTMENT_RE = /(House|Senate)\s+Conferees\s+Appointed:\s*([^\n]*)/gi;

/** A role marker that closes a semicolon-group (everyone in it is a chair). */
const ROLE_RE = /^(?:co-?\s*)?(?:vice[\s-]*)?chairs?$/i;

/** A bare initial like "M" or "M." — attaches to the preceding surname. */
const INITIAL_RE = /^[A-Z]\.?$/;

/**
 * Parse conferees from a bill's status updates. Returns House members first,
 * then Senate, in appointment order. When a chamber is re-appointed (a later
 * "Conferees Appointed" line for the same chamber), the LATEST line wins.
 * Returns [] when no appointment line is present. Pure.
 */
export function parseConferees(updates: StatusLine[] | null | undefined): ParsedConferee[] {
  const byChamber = new Map<'House' | 'Senate', ParsedConferee[]>();

  for (const update of updates ?? []) {
    const text = update.statustext ?? '';
    APPOINTMENT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = APPOINTMENT_RE.exec(text)) !== null) {
      const chamber = (m[1][0].toUpperCase() === 'H' ? 'House' : 'Senate') as 'House' | 'Senate';
      const members = parseRoster(m[2], chamber);
      if (members.length > 0) byChamber.set(chamber, members); // latest wins
    }
  }

  return [...(byChamber.get('House') ?? []), ...(byChamber.get('Senate') ?? [])];
}

/**
 * Parse one chamber's roster ("Sayama, Lee, M. Co-Chairs; Reyes Oda") into
 * conferees. Semicolons separate groups; a trailing role marker in a group
 * marks everyone in it as a chair; within a group, commas separate surnames,
 * except a lone initial ("M.") attaches to the preceding surname.
 */
function parseRoster(roster: string, chamber: 'House' | 'Senate'): ParsedConferee[] {
  const out: ParsedConferee[] = [];

  // Drop the sentence-ending period, but keep an initial's period ("… M.").
  const trimmed = roster.trim();
  const body = /(?:^|[^A-Z])[A-Z]\.$/.test(trimmed) ? trimmed : trimmed.replace(/\.$/, '');

  for (const rawGroup of body.split(';')) {
    const tokens = rawGroup
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    if (tokens.length === 0) continue;

    // A role marker may be the whole last token ("Chair") or trail the last
    // name ("Bbb Co-Chairs"). Detect and strip it; if present the group is chairs.
    let groupIsChair = false;
    const last = tokens[tokens.length - 1];
    if (ROLE_RE.test(last)) {
      groupIsChair = true;
      tokens.pop();
    } else {
      const words = last.split(/\s+/);
      if (words.length > 1 && ROLE_RE.test(words[words.length - 1])) {
        groupIsChair = true;
        tokens[tokens.length - 1] = words.slice(0, -1).join(' ');
      }
    }

    const start = out.length;
    for (const token of tokens) {
      if (INITIAL_RE.test(token) && out.length > start) {
        // An initial belongs to the surname just added within this group.
        out[out.length - 1].surname += `, ${token}`;
        continue;
      }
      out.push({ surname: token, chamber, isChair: false });
    }
    if (groupIsChair) {
      for (let i = start; i < out.length; i++) out[i].isChair = true;
    }
  }

  return out;
}
