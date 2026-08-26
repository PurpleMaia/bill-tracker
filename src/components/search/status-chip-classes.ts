/**
 * Status chip colors for search result cards.
 *
 * This MIRRORS getColumnPhaseBg in kanban-column.tsx exactly — same statuses,
 * same three buckets, same hex values — so a bill's status reads the same color
 * on the search page as the column it would sit in on the board. If the board's
 * function changes, change this to match.
 *
 * The board's mapping, verbatim:
 *   vetoList                             -> #f8d7d2  (red)
 *   governorSigns | lawWithoutSignature  -> #d6e8d4  (green)
 *   introduced | waiting* | crossoverWaiting* | passedCommittees
 *     | transmittedGovernor              -> olive-soft
 *   everything else                      -> secondary (neutral)
 *
 * NOTE ON LOCATION: this lives under src/components/, not src/lib/, because
 * Tailwind's `content` globs cover src/pages, src/components, and src/app only.
 * Class strings written in src/lib are never scanned, so the utilities they name
 * are never generated and the styles silently do not apply.
 */

export type StatusPhase = 'enacted' | 'vetoed' | 'waiting' | 'neutral';

/**
 * Which legislative phase a concrete BillStatus belongs to.
 *
 * The board keys off simplified COLUMN ids; a search result carries a concrete
 * BillStatus. `waiting2`/`waiting3` and `crossoverWaiting1..3` are the concrete
 * statuses behind the board's simpleWaiting / crossoverWaiting columns, so they
 * land in the same bucket. Scheduled, deferred, and conference statuses are
 * deliberately neutral — those columns are `bg-secondary/50` on the board.
 */
export function getStatusPhase(status: string | null | undefined): StatusPhase {
  if (!status) return 'neutral';

  if (status === 'vetoList') return 'vetoed';
  if (status === 'governorSigns' || status === 'lawWithoutSignature') return 'enacted';
  if (
    status === 'introduced' ||
    status.startsWith('waiting') ||
    status.startsWith('crossoverWaiting') ||
    status === 'passedCommittees' ||
    status === 'transmittedGovernor'
  ) {
    return 'waiting';
  }
  return 'neutral';
}

/**
 * Backgrounds are the board's exact values. Text is darkened per phase because
 * these fills are tuned as large column backgrounds, and 10px chip text needs
 * more contrast against them than the default foreground provides.
 */
const PHASE_CHIP_CLASSES: Record<StatusPhase, string> = {
  enacted: 'border-[#8fbf88] bg-[#d6e8d4] text-[#1e4620]',
  vetoed: 'border-[#e8a79e] bg-[#f8d7d2] text-[#7f2418]',
  waiting: 'border-olive/40 bg-olive-soft text-olive-dark',
  neutral: 'border-border bg-secondary/60 text-secondary-foreground',
};

export function getStatusChipClasses(status: string | null | undefined): string {
  return PHASE_CHIP_CLASSES[getStatusPhase(status)];
}
