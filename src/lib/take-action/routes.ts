/**
 * Take Action section — the one place its URLs live. The section has two
 * tabs: Testimony (with All / Drafts / Submitted filters) and Contact
 * Legislators. The old /testimonies URLs redirect here (next.config.ts).
 */

export const TAKE_ACTION_ROOT = '/take-action';
export const TESTIMONY_HREF = '/take-action/testimony';
export const TESTIMONY_DRAFTS_HREF = '/take-action/testimony/drafts';
export const TESTIMONY_SUBMITTED_HREF = '/take-action/testimony/submitted';
export const CONTACT_HREF = '/take-action/contact';

/** URL for each Testimony filter pill (All / Drafts / Submitted). */
export const TESTIMONY_FILTER_HREFS = {
  all: TESTIMONY_HREF,
  drafts: TESTIMONY_DRAFTS_HREF,
  submitted: TESTIMONY_SUBMITTED_HREF,
} as const;

/**
 * `?from=` values the testimony writer and contact page accept to send Back
 * to the right Take Action tab. 'testimonies' is the pre-rename value, kept
 * so bookmarked and in-flight links still return somewhere sensible.
 */
export const FROM_TESTIMONY = 'testimony';
export const FROM_CONTACT = 'contact';
const LEGACY_FROM_TESTIMONIES = 'testimonies';

/** Where Back goes for a `?from=` value; `fallback` when it names no tab. */
export function takeActionBackHref(from: string | null | undefined, fallback = '/'): string {
  if (from === FROM_TESTIMONY || from === LEGACY_FROM_TESTIMONIES) return TESTIMONY_HREF;
  if (from === FROM_CONTACT) return CONTACT_HREF;
  return fallback;
}

/** True for any page in the Take Action section. */
export function isTakeActionPath(pathname: string): boolean {
  return pathname === TAKE_ACTION_ROOT || pathname.startsWith(`${TAKE_ACTION_ROOT}/`);
}
