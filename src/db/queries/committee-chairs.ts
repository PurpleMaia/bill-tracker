import { committeeFullName } from '@/lib/testimony/committees';
import { MOCK_CHAIRS } from './committee-chairs.mock';

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

/**
 * Chairs + vice-chairs for the given committee codes.
 * MOCK-backed today; swap this body for committees → committee_chairs →
 * legislators joins when those tables exist. Callers do not change.
 */
export async function getCommitteeChairs(codes: string[]): Promise<CommitteeChair[]> {
  const seen = new Set<string>();
  const out: CommitteeChair[] = [];

  for (const raw of codes) {
    const code = raw.trim().toUpperCase();
    if (!code || seen.has(code)) continue;
    seen.add(code);

    const entry = MOCK_CHAIRS[code];
    if (!entry) continue;

    const committeeName = committeeFullName(code);
    out.push({
      committeeCode: code, committeeName, role: 'chair',
      legislatorName: entry.chair.name, chamber: entry.chamber,
      email: entry.chair.email, phone: entry.chair.phone,
    });
    out.push({
      committeeCode: code, committeeName, role: 'vice-chair',
      legislatorName: entry.viceChair.name, chamber: entry.chamber,
      email: entry.viceChair.email, phone: entry.viceChair.phone,
    });
  }

  return out;
}
