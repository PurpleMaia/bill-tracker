export const SECTIONS = ['tracker', 'find-bills', 'take-action', 'community', 'guide', 'learn', 'bill'] as const;
export type Section = (typeof SECTIONS)[number];

const COMMUNITY_FIXED = new Set(['following', 'your-organization']);
const FIRST_SEGMENT_SECTIONS = new Set<string>(['find-bills', 'take-action', 'community', 'guide', 'learn']);

/** Strips query/hash and trailing slash; collapses ids/slugs so paths aggregate. */
export function normalizePath(pathname: string): string {
  const clean = pathname.split('#')[0].split('?')[0];
  const segs = clean.split('/').filter(Boolean);
  if (segs[0] === 'bills' && segs.length > 1) segs[1] = '[id]';
  else if (segs[0] === 'community' && segs.length > 1 && !COMMUNITY_FIXED.has(segs[1])) segs[1] = '[slug]';
  return '/' + segs.join('/');
}

/** Which tracked section a path belongs to, or null if it is never page-view tracked. */
export function sectionForPath(pathname: string): Section | null {
  const first = normalizePath(pathname).split('/')[1] ?? '';
  // `/` re-exports Find Bills (see src/app/(main)/page.tsx).
  if (first === '') return 'find-bills';
  if (first === 'tracker') return 'tracker';
  if (first === 'bills') return 'bill';
  return FIRST_SEGMENT_SECTIONS.has(first) ? (first as Section) : null;
}
