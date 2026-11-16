import type { LegislatorCommitteeRole, LegislatorOption } from '@/types/legislation';

export interface LegislatorRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  chamber: string | null;
  district: number | null;
  in_office: boolean;
}

export interface LegislatorRoleRow {
  legislator_id: string;
  /** committees.acronym */
  code: string;
  /** DB value: 'chair' | 'vice_chair' */
  role: string;
}

function toRole(role: string): LegislatorCommitteeRole['role'] {
  return role === 'vice_chair' ? 'vice-chair' : 'chair';
}

function toChamber(chamber: string | null): 'House' | 'Senate' {
  return chamber === 'Senate' ? 'Senate' : 'House';
}

function compareRoles(a: LegislatorCommitteeRole, b: LegislatorCommitteeRole): number {
  if (a.role !== b.role) return a.role === 'chair' ? -1 : 1;
  return a.code.localeCompare(b.code);
}

/** Null names sort after real names; ties break on the other name. */
function compareName(a: string, b: string): number {
  if (a === '' && b !== '') return 1;
  if (b === '' && a !== '') return -1;
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

/**
 * Pure row → option mapping for the legislator picker: groups active committee
 * roles per legislator (chair before vice-chair, then by code, codes
 * upper-cased) and orders A–Z by last name then first name, nulls last.
 */
export function buildLegislatorOptions(
  legislators: LegislatorRow[],
  roles: LegislatorRoleRow[],
): LegislatorOption[] {
  const byLegislator = new Map<string, LegislatorCommitteeRole[]>();
  for (const r of roles) {
    const list = byLegislator.get(r.legislator_id) ?? [];
    list.push({ code: r.code.toUpperCase(), role: toRole(r.role) });
    byLegislator.set(r.legislator_id, list);
  }

  return legislators
    .map<LegislatorOption>((l) => ({
      id: l.id,
      firstName: l.first_name ?? '',
      lastName: l.last_name ?? '',
      chamber: toChamber(l.chamber),
      district: l.district,
      inOffice: l.in_office,
      committees: (byLegislator.get(l.id) ?? []).sort(compareRoles),
    }))
    .sort(
      (a, b) =>
        compareName(a.lastName, b.lastName) || compareName(a.firstName, b.firstName),
    );
}
