/**
 * Pure slug derivation for organization names.
 *
 * Kept DB-free so it can be unit-tested in isolation. The uniqueness loop that
 * appends `-2`, `-3`, … lives in the query layer (`db/queries/tenants.ts`),
 * which owns DB access; this module only turns a name into a base slug.
 */

/** Longest slug we ever store; matches the register route's historical cap. */
export const MAX_SLUG_LENGTH = 50;

/**
 * Turns an org name into a URL-safe base slug: lowercase, non-alphanumerics
 * collapsed to single hyphens, trimmed to {@link MAX_SLUG_LENGTH}.
 *
 * Returns an empty string when the name has no slug-able characters (e.g. only
 * symbols); callers decide how to handle that.
 */
export function deriveOrgSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, MAX_SLUG_LENGTH)
    // Trim AFTER slicing: a cut that lands on a hyphen would otherwise leave a
    // trailing separator.
    .replace(/^-|-$/g, '');
}

/**
 * Builds the nth candidate slug when earlier candidates are already taken.
 * `attempt` 0 is the bare base; 1+ appends `-{attempt+1}` (so `-2`, `-3`, …),
 * trimming the base so the suffixed result still fits {@link MAX_SLUG_LENGTH}.
 */
export function slugCandidate(base: string, attempt: number): string {
  if (attempt === 0) return base;
  const suffix = `-${attempt + 1}`;
  // Trim a trailing hyphen off the truncated base so a cut landing on a
  // separator doesn't produce a doubled hyphen ('foo--2').
  const truncated = base.slice(0, MAX_SLUG_LENGTH - suffix.length).replace(/-$/, '');
  return truncated + suffix;
}
