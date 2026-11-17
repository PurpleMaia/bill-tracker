import type { LegislatorOption } from '@/types/legislation';

/** "Lee, Mike (H-12)", with " (former)" appended for legislators out of office. */
export function formatLegislatorLabel(o: LegislatorOption): string {
  let label = o.firstName ? `${o.lastName}, ${o.firstName}` : o.lastName;
  if (o.district !== null) label += ` (${o.chamber === 'Senate' ? 'S' : 'H'}-${o.district})`;
  if (!o.inOffice) label += ' (former)';
  return label;
}

/** "Chair AGR · Vice Chair FIN": chair roles first, then vice-chair, order otherwise kept. */
export function formatRoles(o: LegislatorOption): string {
  const chairs = o.committees.filter((c) => c.role === 'chair');
  const vices = o.committees.filter((c) => c.role === 'vice-chair');
  return [
    ...chairs.map((c) => `Chair ${c.code}`),
    ...vices.map((c) => `Vice Chair ${c.code}`),
  ].join(' · ');
}
