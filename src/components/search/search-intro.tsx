'use client';

/**
 * Front-door hero for the search page.
 *
 * This page is the app's landing surface, so a first-time visitor arrives with no
 * idea what the corpus contains or what a useful query looks like. The search bar
 * lives inside this card (rather than above it) so the first thing a newcomer
 * reads explains what they're searching before they're asked to type; the
 * suggestion chips give them a one-click way in, since an empty box offers
 * nothing to act on.
 */
const SUGGESTIONS = [
  'agriculture',
  'food security',
  'school meals',
  'aquaculture',
  'farm to school',
  'water rights',
];

interface SearchIntroProps {
  onSuggestionClick: (term: string) => void;
  /** The search input, rendered inside the card beneath the description. */
  children: React.ReactNode;
  /** Sessions covered by the corpus — passed in so this copy never goes stale. */
  sessionYears: number[];
  /**
   * Hides the suggestion chips once the user has typed a query. Filters and
   * year selections keep the chips visible — they're always a valid entry point.
   */
  showSuggestions: boolean;
}

export function SearchIntro({
  onSuggestionClick,
  children,
  sessionYears,
  showSuggestions,
}: SearchIntroProps) {
  const sessionLabel =
    sessionYears.length > 1
      ? `${Math.min(...sessionYears)}–${Math.max(...sessionYears)}`
      : String(sessionYears[0] ?? '');

  return (
    /* Solid deep teal (--primary): the previous near-white gradient let the
       favicon blend into the card and the hero read as another result row. */
    <div className="rounded-lg bg-primary p-5 shadow-sm sm:p-6">
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny static asset, no optimization needed */}
        <img src="/favicon.ico" alt="" className="mx-auto h-11 w-11 shrink-0" />

        <h1 className="mt-3 text-lg font-semibold tracking-tight text-primary-foreground sm:text-xl">
          Search Hawai&#699;i legislation
        </h1>
        <p className="mx-auto mt-1.5 max-w-lg text-sm text-primary-foreground/80">
          Every bill from the {sessionLabel} sessions — search by bill number, title, or what the
          bill actually says, then track the ones you care about to your board.
        </p>
      </div>

      {/* The search input itself. */}
      <div className="mx-auto mt-4 max-w-xl">{children}</div>

      {showSuggestions && (
        <div className="mt-4 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-primary-foreground/70">
            Try searching for
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((term) => (
              <button
                key={term}
                type="button"
                onClick={() => onSuggestionClick(term)}
                className="rounded-full border border-primary-foreground/25 bg-primary-foreground/10 px-3 py-1.5 text-sm text-primary-foreground transition-colors hover:bg-primary-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/60"
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
