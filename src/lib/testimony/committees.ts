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
