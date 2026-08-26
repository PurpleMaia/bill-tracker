import { db } from '@/db/kysely/client';
import type { ParsedConferee } from '@/lib/testimony/conferees';

/**
 * A conferee resolved (or attempted) against the legislators table. Mirrors
 * CommitteeChair's client shape so the contact page can render either. `email`
 * and `phone` are null when the surname couldn't be matched to a legislator —
 * such conferees are still returned (name shown, no send button), never dropped.
 */
export interface Conferee {
  surname: string;
  chamber: 'House' | 'Senate';
  isChair: boolean;
  /** Full "First Last" from the matched legislator, or the raw surname if unmatched. */
  legislatorName: string;
  email: string | null;
  phone: string | null;
  /** Whether a legislator row was matched (has contact info to act on). */
  matched: boolean;
}

/** DB chamber string → client union. */
function toChamber(chamber: string | null): 'House' | 'Senate' {
  return chamber === 'Senate' ? 'Senate' : 'House';
}

function fullName(first: string | null, last: string | null): string {
  return [first, last].filter(Boolean).join(' ').trim();
}

/** The bare surname from a printed name like "Lee, M." or "Reyes Oda". */
function bareSurname(printed: string): string {
  // Drop a trailing initial ("Lee, M." → "Lee"); keep multi-word names whole.
  return printed.replace(/,\s*[A-Z]\.?$/, '').trim();
}

/**
 * Resolve parsed conferees to contact info by matching each surname against the
 * legislators table (last_name, in the same chamber, in office). Preserves the
 * input order and never drops a conferee: an unmatched name comes back with
 * `matched: false` and null contact fields. Multi-word or initialed surnames
 * match on their bare surname. Pure DB read — no writes.
 */
export async function getConferees(conferees: ParsedConferee[]): Promise<Conferee[]> {
  if (conferees.length === 0) return [];

  const surnames = Array.from(new Set(conferees.map((c) => bareSurname(c.surname).toLowerCase())));

  const rows = surnames.length
    ? await db
        .selectFrom('legislators as l')
        .where('l.in_office', '=', true)
        .where((eb) =>
          eb.or(surnames.map((s) => eb(eb.fn('lower', ['l.last_name']), '=', s))),
        )
        .select([
          'l.first_name as firstName',
          'l.last_name as lastName',
          'l.chamber as chamber',
          'l.email as email',
          'l.phone as phone',
        ])
        .execute()
    : [];

  // Index legislators by (chamber, lower surname). A surname unique within a
  // chamber resolves cleanly; ambiguous ones (two legislators, same surname,
  // same chamber) are left unmatched rather than guessed.
  const byKey = new Map<string, { name: string; email: string | null; phone: string | null } | null>();
  for (const r of rows) {
    const key = `${toChamber(r.chamber)}|${(r.lastName ?? '').toLowerCase()}`;
    const entry = { name: fullName(r.firstName, r.lastName), email: r.email, phone: r.phone };
    byKey.set(key, byKey.has(key) ? null : entry); // second hit → ambiguous → null
  }

  return conferees.map((c) => {
    const key = `${c.chamber}|${bareSurname(c.surname).toLowerCase()}`;
    const hit = byKey.get(key) ?? null;
    return {
      surname: c.surname,
      chamber: c.chamber,
      isChair: c.isChair,
      legislatorName: hit?.name ?? c.surname,
      email: hit?.email ?? null,
      phone: hit?.phone ?? null,
      matched: hit != null,
    };
  });
}
