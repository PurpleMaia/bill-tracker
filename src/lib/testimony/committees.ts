/**
 * Hawaii State Legislature committee acronyms → full committee names.
 * Covers every code present in the bills data (House and Senate, including
 * codes from earlier sessions). Pure data + lookup — safe for src/lib.
 */
export const COMMITTEE_NAMES: Record<string, string> = {
  // House
  AGR: 'Agriculture & Food Systems',
  CAA: 'Culture & the Arts',
  CPC: 'Consumer Protection & Commerce',
  ECD: 'Economic Development',
  EDN: 'Education',
  EEP: 'Energy & Environmental Protection',
  FIN: 'Finance',
  HED: 'Higher Education',
  HLT: 'Health',
  HSG: 'Housing',
  HSH: 'Human Services & Homelessness',
  JHA: 'Judiciary & Hawaiian Affairs',
  LAB: 'Labor',
  LMG: 'Legislative Management',
  PBS: 'Public Safety',
  TOU: 'Tourism',
  TRN: 'Transportation',
  WAL: 'Water & Land',
  // Senate
  AEN: 'Agriculture and Environment',
  CPN: 'Commerce and Consumer Protection',
  EDT: 'Economic Development and Tourism',
  EDU: 'Education',
  EIG: 'Energy and Intergovernmental Affairs',
  GVO: 'Government Operations',
  HHS: 'Health and Human Services',
  HOU: 'Housing',
  HRE: 'Higher Education',
  HWN: 'Hawaiian Affairs',
  JDC: 'Judiciary',
  LBT: 'Labor and Technology',
  PSM: 'Public Safety and Military Affairs',
  TCA: 'Transportation, Culture and the Arts',
  TRS: 'Transportation',
  WAM: 'Ways and Means',
  WLA: 'Water and Land',
  WTL: 'Water and Land',
};

/**
 * Full name for a single referral token. Handles joint referrals
 * ("WLA/EIG" → "Water and Land / Energy and Intergovernmental Affairs").
 * Unknown codes pass through unchanged.
 */
export function committeeFullName(code: string): string {
  return code
    .split('/')
    .map((part) => {
      const key = part.trim().toUpperCase();
      return COMMITTEE_NAMES[key] ?? part.trim();
    })
    .join(' / ');
}

/**
 * True when any single referral is a JOINT referral — two committees joined by a
 * slash ("HHS/WAE") that hear the bill together. Operates on comma-split tokens
 * so it can tell "HHS/WAE" (one joint referral) from "HHS, WAE" (two separate
 * ones); a slash WITHIN a token is the signal. Null/empty-safe.
 */
export function hasJointReferral(assignment: string | null | undefined): boolean {
  if (!assignment) return false;
  return assignment.split(',').some((token) => token.includes('/'));
}

/**
 * Plain-language explanation of a joint referral, shared across every surface
 * that mentions committees so the wording never drifts. Kept generic (no codes)
 * so it reads correctly whether one or several referrals are joint.
 */
export const JOINT_REFERRAL_NOTE =
  'A committee code with a slash (like HHS/WAE) is a joint referral: both committees hear the bill together, so both chairs have to agree on when to schedule the hearing.';

/**
 * The set of committee codes that share a JOINT referral with `code`, INCLUDING
 * `code` itself. For "HHS/WAE, SDL" and code "HHS" this returns ["HHS","WAE"];
 * for "SDL" (a lone referral) it returns just ["SDL"].
 *
 * Used to foreground a whole joint referral together: both committees hear the
 * bill at the same hearing, so both are "current" — neither belongs in the
 * collapsed "other committees" list. Comma-split (not `/`-split) so the joint
 * grouping survives. Null/empty-safe; returns [code] when nothing matches.
 */
export function jointReferralPartners(
  assignment: string | null | undefined,
  code: string,
): string[] {
  const target = code.trim().toUpperCase();
  if (!assignment) return [target];
  for (const token of assignment.split(',')) {
    const codes = token
      .split('/')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
    if (codes.includes(target)) return codes;
  }
  return [target];
}

/**
 * Split a committee_assignment string ("AGR, EDN/FIN") into unique, upper-cased
 * committee codes. Splits on commas and slashes, trims, and de-dupes.
 * Empty/null-safe.
 */
export function parseCommitteeCodes(assignment: string | null): string[] {
  if (!assignment) return [];
  const codes = assignment
    .split(/[,/]/)
    .map((c) => c.trim().toUpperCase())
    .filter((c) => c.length > 0);
  return Array.from(new Set(codes));
}

/** One scraped status line: the text plus the codes it references. */
export interface StatusLine {
  statustext: string;
}

/**
 * Referral committee codes a status line names via an explicit connective
 * phrase — "referred to the committee(s) on WAM", "The committee(s) on AEN
 * has scheduled…", "scheduled to be heard by HSG". Only codes in `referralCodes`
 * are returned, upper-cased. This is the PRECISE pass; joint tokens ("WLA/EIG")
 * are split into their parts.
 */
function phraseCodes(text: string, referralCodes: Set<string>): string[] {
  const found = new Set<string>();
  const phraseRe = /(?:committee(?:\(s\))?\s+on|heard\s+by|referred\s+to(?:\s+the)?)\s+([A-Z]{2,4}(?:\/[A-Z]{2,4})*)/gi;
  let m: RegExpExecArray | null;
  while ((m = phraseRe.exec(text)) !== null) {
    for (const part of m[1].split('/')) {
      const code = part.trim().toUpperCase();
      if (referralCodes.has(code)) found.add(code);
    }
  }
  return Array.from(found);
}

/**
 * Referral codes that appear anywhere in the line as a whole word. Looser than
 * {@link phraseCodes} — used only as a fallback when no phrase matched, so an
 * incidental mention never overrides an explicit "committee on X" phrasing.
 */
function bareCodes(text: string, referralCodes: Set<string>): string[] {
  const upper = text.toUpperCase();
  return Array.from(referralCodes).filter((code) => new RegExp(`\\b${code}\\b`).test(upper));
}

/**
 * Infers which committee a bill is *currently* awaiting a hearing before.
 *
 * A bill only moves FORWARD through its referral list (AEN → WAM, never back),
 * so the current committee is the one *furthest along* that the status history
 * mentions. We collect every referral committee named by an explicit phrase
 * ("committee(s) on X", "referred to X", "heard by X") across all updates and
 * return the one latest in referral order. This is deliberately independent of
 * update ordering, so same-day updates (whose relative order the DB does not
 * guarantee) can't flip the result.
 *
 * When no update names a referral committee via a phrase, we fall back to codes
 * mentioned as bare words, and finally to the LAST code in the referral list
 * (referrals are appended as a bill advances). Pure — no DB, no network.
 */
export function inferCurrentCommittee(
  committeeAssignment: string | null,
  updates: StatusLine[] | null | undefined,
): string | null {
  const referral = parseCommitteeCodes(committeeAssignment);
  if (referral.length === 0) return null;
  const referralSet = new Set(referral);
  const list = updates ?? [];

  // Prefer explicit phrase mentions; only if none exist anywhere do we consider
  // looser bare-word mentions. Either way, the current committee is the one
  // furthest along the (forward-only) referral path.
  const collect = (extract: (t: string) => string[]): string | null => {
    let best: string | null = null;
    for (const update of list) {
      for (const code of extract(update.statustext ?? '')) {
        if (best === null || referral.indexOf(code) > referral.indexOf(best)) best = code;
      }
    }
    return best;
  };

  return (
    collect((t) => phraseCodes(t, referralSet)) ??
    collect((t) => bareCodes(t, referralSet)) ??
    referral[referral.length - 1]
  );
}
