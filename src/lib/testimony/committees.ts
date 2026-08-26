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
 * Committee codes referenced in a single status line, upper-cased. Matches the
 * common scraped phrasings — "referred to the committee(s) on WAM",
 * "The committee(s) on AEN has scheduled…", "scheduled to be heard by HSG" —
 * and also picks up any bare token that's one of the bill's referral codes.
 */
function codesInStatusText(text: string, referralCodes: Set<string>): string[] {
  const found = new Set<string>();

  // "committee(s) on X" / "heard by X" — the code trails a connective phrase.
  const phraseRe = /(?:committee(?:\(s\))?\s+on|heard\s+by|referred\s+to(?:\s+the)?)\s+([A-Z]{2,4}(?:\/[A-Z]{2,4})*)/gi;
  let m: RegExpExecArray | null;
  while ((m = phraseRe.exec(text)) !== null) {
    for (const part of m[1].split('/')) {
      const code = part.trim().toUpperCase();
      if (referralCodes.has(code)) found.add(code);
    }
  }

  // Fallback: any bare occurrence of a known referral code as a whole word.
  for (const code of referralCodes) {
    if (new RegExp(`\\b${code}\\b`).test(text.toUpperCase())) found.add(code);
  }

  return Array.from(found);
}

/**
 * Infers which committee a bill is *currently* awaiting a hearing before.
 *
 * Walks the status updates newest → oldest and returns the first referral
 * committee code that a status line references (a scheduling/referral notice
 * for that committee is the freshest signal of where the bill sits). When no
 * update names a referral committee, falls back to the LAST code in the
 * referral list, since referrals are appended as a bill advances.
 *
 * `updates` MUST be ordered newest-first (as `BillDetails.updates` is). Pure —
 * no DB, no network.
 */
export function inferCurrentCommittee(
  committeeAssignment: string | null,
  updates: StatusLine[] | null | undefined,
): string | null {
  const referral = parseCommitteeCodes(committeeAssignment);
  if (referral.length === 0) return null;
  const referralSet = new Set(referral);

  for (const update of updates ?? []) {
    const codes = codesInStatusText(update.statustext ?? '', referralSet);
    if (codes.length > 0) {
      // Return the earliest-in-referral-order code named on this line. Pipeline
      // progression is handled by newest-update-wins (we scan newest first);
      // within one line, earliest order keeps joint referrals ("WLA/EIG")
      // resolving to their leading committee deterministically.
      let best = codes[0];
      for (const code of codes) {
        if (referral.indexOf(code) < referral.indexOf(best)) best = code;
      }
      return best;
    }
  }

  return referral[referral.length - 1];
}
