// PURE introducer → legislator resolution — no DB, no network. Turns a bill's
// free-text introducer string ("KEOHOKALOLE, MORIWAKI", "LEE, M.") into
// legislator ids. This is the reference behaviour for the backfill script and
// the external scraper; src/lib/__tests__/fixtures/legislator-links.json is
// the cross-repo contract. Tokens matching zero or several legislators are
// reported as `unresolved`, never guessed.
import { parseIntroducers } from '@/lib/legislators/governor-contact';

export interface LegislatorRef {
  id: string;
  firstName: string | null;
  lastName: string | null;
  chamber: string | null;
}

/** `position` is the token's 0-based index in the source string (0 = primary introducer). */
export interface IntroducerLink {
  legislatorId: string;
  position: number;
}

export interface IntroducerResolution {
  links: IntroducerLink[];
  /** Original token text of each token that matched zero or several legislators. */
  unresolved: string[];
}

/** Lowercase, strip diacritics, drop okina/apostrophes, collapse whitespace. */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ʻ'‘’]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function resolveIntroducers(
  introducer: string | null | undefined,
  billNumber: string,
  legislators: LegislatorRef[],
): IntroducerResolution {
  const links: IntroducerLink[] = [];
  const unresolved: string[] = [];
  const seen = new Set<string>();

  parseIntroducers(introducer, billNumber).forEach((token, position) => {
    const [rawSurname, rawInitial] = token.surname.split(', ');
    const surname = normalizeName(rawSurname);
    const initial = rawInitial ? normalizeName(rawInitial.replace(/\./g, '')) : '';
    const chamber = token.chamber.toLowerCase();

    const candidates = legislators.filter(
      (l) =>
        l.lastName != null &&
        l.chamber?.toLowerCase() === chamber &&
        normalizeName(l.lastName) === surname &&
        (!initial || normalizeName(l.firstName ?? '').startsWith(initial)),
    );

    if (candidates.length !== 1) {
      unresolved.push(token.surname);
      return;
    }
    const { id } = candidates[0];
    if (seen.has(id)) return;
    seen.add(id);
    links.push({ legislatorId: id, position });
  });

  return { links, unresolved };
}
