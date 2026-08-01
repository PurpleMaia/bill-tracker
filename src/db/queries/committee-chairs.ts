import { db } from '@/db/kysely/client';

export type CommitteeRole = 'chair' | 'vice-chair';

export interface CommitteeChair {
  committeeCode: string;
  committeeName: string;
  role: CommitteeRole;
  legislatorName: string;
  chamber: 'House' | 'Senate';
  email: string | null;
  phone: string | null;
}

/** DB stores 'chair' | 'vice_chair'; the client type uses a hyphen. */
function toClientRole(role: string): CommitteeRole {
  return role === 'vice_chair' ? 'vice-chair' : 'chair';
}

function fullName(first: string | null, last: string | null): string {
  return [first, last].filter(Boolean).join(' ').trim();
}

function toChamber(chamber: string | null): 'House' | 'Senate' {
  return chamber === 'Senate' ? 'Senate' : 'House';
}

/**
 * Active chairs + vice-chairs for the given committee codes, joined from
 * committees → committee_chairs → legislators (the real data — no mocks).
 *
 * Preserves the caller's committee order and de-dupes codes. A requested code
 * with no active chair rows simply contributes no entries; callers must not
 * assume every requested code appears (see the contact page's empty state).
 */
export async function getCommitteeChairs(codes: string[]): Promise<CommitteeChair[]> {
  const seen = new Set<string>();
  const wanted: string[] = [];
  for (const raw of codes) {
    const code = raw.trim().toUpperCase();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    wanted.push(code);
  }
  if (wanted.length === 0) return [];

  const rows = await db
    .selectFrom('committee_chairs as cc')
    .innerJoin('committees as c', 'c.id', 'cc.committee_id')
    .innerJoin('legislators as l', 'l.id', 'cc.legislator_id')
    .where('cc.is_active', '=', true)
    .where('c.acronym', 'in', wanted)
    .select([
      'c.acronym as committeeCode',
      'c.name as committeeName',
      'c.chamber as committeeChamber',
      'cc.role as role',
      'l.first_name as firstName',
      'l.last_name as lastName',
      'l.chamber as legislatorChamber',
      'l.email as email',
      'l.phone as phone',
    ])
    .execute();

  const byCode = new Map<string, CommitteeChair[]>();
  for (const r of rows) {
    const list = byCode.get(r.committeeCode) ?? [];
    list.push({
      committeeCode: r.committeeCode,
      committeeName: r.committeeName,
      role: toClientRole(r.role),
      legislatorName: fullName(r.firstName, r.lastName),
      chamber: toChamber(r.legislatorChamber ?? r.committeeChamber),
      email: r.email,
      phone: r.phone,
    });
    byCode.set(r.committeeCode, list);
  }

  // Emit in the caller's requested order; chairs before vice-chairs within a
  // committee so the primary contact leads.
  const out: CommitteeChair[] = [];
  for (const code of wanted) {
    const list = byCode.get(code);
    if (!list) continue;
    list.sort((a, b) => (a.role === b.role ? 0 : a.role === 'chair' ? -1 : 1));
    out.push(...list);
  }
  return out;
}
