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
import { parseLocalDate } from '@/lib/core/utils';

/**
 * A status line as this parser reads it: the text, plus an OPTIONAL date. The
 * date matters because "Appointed" replaces a chamber's roster and "Added"
 * appends to it — both are chronological. Real callers pass DB `StatusUpdate`s
 * (which carry a date); the field is optional so a bare {@link StatusLine} still
 * works, falling back to input order.
 */
type ConfereeStatusLine = StatusLine & { date?: string | null };

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

// "House Conferees Appointed: <roster>" / "…Added: <sentence>" — captures the
// chamber, the verb (Appointed vs. Added), and the text after the colon. The
// text runs to the end of the line/string; a trailing sentence period is stripped
// downstream. We can't terminate on a bare period because initials ("Lee, M.")
// contain periods mid-roster.
//
// Two verbs, two semantics: "Appointed" names a full roster and REPLACES the
// chamber's conferees (latest appointment wins); "Added" names one or more
// members joining and APPENDS them to the roster built so far.
const CONFEREE_LINE_RE = /(House|Senate)\s+Conferees\s+(Appointed|Added):\s*([^\n]*)/gi;

/** A role marker that closes a semicolon-group (everyone in it is a chair). */
const ROLE_RE = /^(?:co-?\s*)?(?:vice[\s-]*)?chairs?$/i;

/** A bare initial like "M" or "M." — attaches to the preceding surname. */
const INITIAL_RE = /^[A-Z]\.?$/;

// A legislator title prefix on an "Added" line ("Representative Garcia") — dropped
// so only the surname remains.
const TITLE_RE = /\b(?:Representatives?|Senators?|Reps?\.?|Sens?\.?)\s+/gi;
// The trailing clause of an "Added" sentence: "added as Conferee(s)" or
// "added as Co-Chair(s)". Captures the role so we can flag chairs.
const ADDED_CLAUSE_RE = /\s+added\s+as\s+((?:co-?\s*)?(?:vice[\s-]*)?chairs?|conferees?)\s*\.?\s*$/i;

/**
 * Parse conferees from a bill's status updates. Returns House members first,
 * then Senate, in appointment order. "Conferees Appointed" REPLACES a chamber's
 * roster (latest appointment wins); "Conferees Added" APPENDS the named member(s)
 * to it, skipping anyone already present. Returns [] when no conferee line is
 * present. Pure.
 *
 * Both semantics are chronological, so we sort updates OLDEST-first before
 * parsing — callers hand us the DB's newest-first array, and undated (or
 * same-day) lines keep their input order via a stable sort.
 */
/**
 * Stable oldest-first sort by `date`. Undated / unparseable lines sort as if
 * dated -Infinity (kept at the front, before any dated line), and ties preserve
 * input order — matching the sibling parsers' "same-day order is undefined"
 * caveat rather than inventing an order for it.
 */
function sortOldestFirst<T extends ConfereeStatusLine>(updates: T[]): T[] {
  const time = (u: T): number => {
    const d = u.date ? parseLocalDate(u.date) : null;
    return d ? d.getTime() : -Infinity;
  };
  return [...updates].sort((a, b) => time(a) - time(b));
}

export function parseConferees(updates: ConfereeStatusLine[] | null | undefined): ParsedConferee[] {
  const byChamber = new Map<'House' | 'Senate', ParsedConferee[]>();

  for (const update of sortOldestFirst(updates ?? [])) {
    const text = update.statustext ?? '';
    CONFEREE_LINE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CONFEREE_LINE_RE.exec(text)) !== null) {
      const chamber = (m[1][0].toUpperCase() === 'H' ? 'House' : 'Senate') as 'House' | 'Senate';
      const isAddition = m[2].toLowerCase() === 'added';
      const members = isAddition ? parseAddition(m[3], chamber) : parseRoster(m[3], chamber);
      if (members.length === 0) continue;

      if (isAddition) {
        // Append to the roster built so far, skipping anyone already present.
        const existing = byChamber.get(chamber) ?? [];
        const have = new Set(existing.map((c) => c.surname.toLowerCase()));
        const fresh = members.filter((c) => !have.has(c.surname.toLowerCase()));
        byChamber.set(chamber, [...existing, ...fresh]);
      } else {
        byChamber.set(chamber, members); // latest appointment wins
      }
    }
  }

  return [...(byChamber.get('House') ?? []), ...(byChamber.get('Senate') ?? [])];
}

/**
 * Parse an "Added" sentence ("Representative Garcia added as Conferee.",
 * "Representatives Garcia, Lee added as Conferees.") into conferees. Strips title
 * prefixes and the trailing "added as <role>" clause, splits the remaining names
 * on commas / "and", and flags them as chairs when the clause names a chair role.
 */
function parseAddition(sentence: string, chamber: 'House' | 'Senate'): ParsedConferee[] {
  let body = sentence.trim();

  // Peel off the trailing "added as Conferee(s)/Co-Chair(s)" clause and read the role.
  let isChair = false;
  const clause = body.match(ADDED_CLAUSE_RE);
  if (clause) {
    isChair = ROLE_RE.test(clause[1].trim());
    body = body.slice(0, clause.index).trim();
  }
  body = body.replace(TITLE_RE, ' ').replace(/\.\s*$/, '').trim();

  return body
    .split(/\s*,\s*|\s+and\s+/i)
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .map((surname) => ({ surname, chamber, isChair }));
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
