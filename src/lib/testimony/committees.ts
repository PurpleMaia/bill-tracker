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

/**
 * Split a committee_assignment string into ordered referral STEPS, preserving
 * joint hearings. Commas separate sequential steps; a slash marks committees
 * heard together in one step. "AGR, JDC/HWN, FIN" → [["AGR"], ["JDC","HWN"],
 * ["FIN"]]. Codes are upper-cased and trimmed; a code already seen in an earlier
 * step is dropped (so steps stay disjoint), and empty steps are removed.
 */
export function parseCommitteeSteps(assignment: string | null): string[][] {
  if (!assignment) return [];
  const seen = new Set<string>();
  const steps: string[][] = [];
  for (const token of assignment.split(',')) {
    const step: string[] = [];
    for (const part of token.split('/')) {
      const code = part.trim().toUpperCase();
      if (!code || seen.has(code)) continue;
      seen.add(code);
      step.push(code);
    }
    if (step.length > 0) steps.push(step);
  }
  return steps;
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
 * Infers the committee(s) a bill is *currently* awaiting a hearing before.
 *
 * Referral STEPS are met IN ORDER — the FIRST step is the gate the bill must
 * clear first, the last is the final gate. So the current step is the EARLIEST
 * one not yet cleared (passed / reported / recommended passage). A later step
 * can't be current while an earlier one still holds the bill.
 *
 * A joint hearing ("JDC/HWN") is ONE step whose committees are heard together,
 * so it is returned WHOLE (all its codes) and is only considered cleared once
 * EVERY committee in it has cleared. Callers should foreground all returned
 * codes, not just the first.
 *
 * We treat an explicit "referred to X" as proof that everything in steps BEFORE
 * X's step cleared, advancing the frontier even when the clearing line is terse.
 * Deferrals do not clear a committee (the bill is stuck there). This is
 * independent of update ordering, so same-day updates can't flip the result.
 *
 * Fallback when the status history gives no signal: the FIRST step, the gate a
 * freshly-referred bill must meet first. Returns [] only when there is no
 * committee assignment at all. Pure — no DB, no network.
 */
export function inferCurrentCommittee(
  committeeAssignment: string | null,
  updates: StatusLine[] | null | undefined,
): string[] {
  const steps = parseCommitteeSteps(committeeAssignment);
  if (steps.length === 0) return [];
  const list = updates ?? [];

  // Step index of a code, or -1 if it isn't in the referral.
  const stepIndexOf = (code: string): number =>
    steps.findIndex((step) => step.includes(code));

  // The furthest-along STEP the bill has been explicitly REFERRED to: every step
  // before it has necessarily cleared. A joint token advances the frontier to the
  // step its (concurrent) members belong to.
  let referredFrontier = -1;
  for (const update of list) {
    const text = update.statustext ?? '';
    // Only count referral phrasing, not a bare hearing mention.
    const referredRe = /referred\s+to(?:\s+the)?(?:\s+committee(?:\(s\))?\s+on)?\s+([A-Z]{2,4}(?:\/[A-Z]{2,4})*)/gi;
    let m: RegExpExecArray | null;
    while ((m = referredRe.exec(text)) !== null) {
      for (const part of m[1].split('/')) {
        const idx = stepIndexOf(part.trim().toUpperCase());
        if (idx > referredFrontier) referredFrontier = idx;
      }
    }
  }

  // Walk the steps in order; the current step is the first that is neither before
  // the referred frontier nor fully cleared. A joint step clears only when ALL of
  // its committees have cleared.
  for (let i = 0; i < steps.length; i++) {
    if (i < referredFrontier) continue; // an earlier gate the bill already passed
    const step = steps[i];
    const allCleared = step.every((code) => list.some((u) => committeeCleared(u.statustext ?? '', code)));
    if (!allCleared) return step;
  }

  // Every step has cleared — the bill is past its referral gates. Surface the
  // final step as the last one that acted.
  return steps[steps.length - 1];
}
