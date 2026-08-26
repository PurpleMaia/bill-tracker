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
 * Whether a status line reports that the named committee has FINISHED with the
 * bill — passed it, reported it out, or recommended it be passed — i.e. cleared
 * it onward. A deferral is NOT clearing: the bill is stuck at that committee, so
 * it remains the current one. Matches the common capitol phrasings:
 *   "The committee(s) on AEN recommend(s) that the measure be PASSED …"
 *   "Reported from AEN …" / "The committee on AEN passed the measure."
 *   "Passed Second Reading and referred to the committee(s) on WAM."  (AEN cleared)
 */
function committeeCleared(text: string, code: string): boolean {
  const upper = text.toUpperCase();
  const c = code.toUpperCase();

  // "referred to (the committee(s) on) X" means every EARLIER committee cleared
  // it — the bill now sits at X. Callers handle that via referral position; here
  // we answer specifically whether THIS committee has let the bill move on.

  // Explicit report/pass by this committee.
  const reportedFrom = new RegExp(`\\bREPORTED\\b[^.]*\\bFROM\\b[^.]*\\b${c}\\b`).test(upper);
  const committeeActed = new RegExp(`\\b${c}\\b[^.]*\\b(?:PASSED|REPORTED|RECOMMEND(?:S|ED)?\\s+THAT\\s+THE\\s+MEASURE\\s+BE\\s+PASSED)\\b`).test(upper);

  return reportedFrom || committeeActed;
}

/**
 * Infers which committee a bill is *currently* awaiting a hearing before.
 *
 * Committees in the referral list are met IN ORDER — the FIRST code is the
 * committee the bill must clear first, the last is the final gate. So the
 * committee it's currently waiting on is the EARLIEST one in the list that has
 * not yet cleared the bill (passed / reported / recommended passage). A later
 * committee can't be current while an earlier one still holds the bill.
 *
 * We also treat an explicit "referred to X" as proof that everything BEFORE X
 * cleared, which advances the frontier even when the clearing line itself is
 * terse. Deferrals do not clear a committee (the bill is stuck there). This is
 * independent of update ordering, so same-day updates can't flip the result.
 *
 * Fallback when the status history gives no signal: the FIRST code in the list,
 * the committee a freshly-referred bill must meet first. Pure — no DB, no network.
 */
export function inferCurrentCommittee(
  committeeAssignment: string | null,
  updates: StatusLine[] | null | undefined,
): string | null {
  const referral = parseCommitteeCodes(committeeAssignment);
  if (referral.length === 0) return null;
  const list = updates ?? [];

  // The furthest-along committee the bill has been explicitly REFERRED to: every
  // committee before it has necessarily cleared. Index into `referral`, or -1.
  // A joint token ("WLA/EIG") is ONE concurrent referral step, so it advances the
  // frontier only to the earliest of its parts — the joint committees are heard
  // together, not in sequence.
  let referredFrontier = -1;
  for (const update of list) {
    const text = update.statustext ?? '';
    // Only count referral phrasing, not a bare hearing mention.
    const referredRe = /referred\s+to(?:\s+the)?(?:\s+committee(?:\(s\))?\s+on)?\s+([A-Z]{2,4}(?:\/[A-Z]{2,4})*)/gi;
    let m: RegExpExecArray | null;
    while ((m = referredRe.exec(text)) !== null) {
      const idxs = m[1]
        .split('/')
        .map((p) => referral.indexOf(p.trim().toUpperCase()))
        .filter((idx) => idx >= 0);
      if (idxs.length === 0) continue;
      const stepIdx = Math.min(...idxs); // earliest part of a concurrent referral
      if (stepIdx > referredFrontier) referredFrontier = stepIdx;
    }
  }

  // Walk the list in order; the current committee is the first one that is
  // neither before the referred frontier nor independently reported cleared.
  for (let i = 0; i < referral.length; i++) {
    const code = referral[i];
    if (i < referredFrontier) continue; // an earlier gate the bill already passed
    const clearedHere = list.some((u) => committeeCleared(u.statustext ?? '', code));
    if (!clearedHere) return code;
  }

  // Every committee has cleared — the bill is past its referral gates. Surface
  // the final committee as the last one that acted.
  return referral[referral.length - 1];
}
