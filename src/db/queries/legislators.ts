import { db } from '@/db/kysely/client';
import { buildLegislatorOptions } from '@/lib/legislators/legislator-options';
import type { LegislatorOption } from '@/types/legislation';

/**
 * Every legislator with their active committee leadership roles, for the
 * Discover legislator picker. Ordered by last name, first name (nulls last).
 * Two plain queries joined in TS keeps the grouping unit-testable.
 */
export async function getLegislatorOptions(): Promise<LegislatorOption[]> {
  const [legislators, roles] = await Promise.all([
    db
      .selectFrom('legislators')
      .select(['id', 'first_name', 'last_name', 'chamber', 'district', 'in_office'])
      .execute(),
    db
      .selectFrom('committee_chairs as cc')
      .innerJoin('committees as c', 'c.id', 'cc.committee_id')
      .where('cc.is_active', '=', true)
      .where('c.is_active', '=', true)
      .select(['cc.legislator_id as legislator_id', 'c.acronym as code', 'cc.role as role'])
      .execute(),
  ]);
  return buildLegislatorOptions(legislators, roles);
}
