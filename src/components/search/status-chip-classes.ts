/**
 * Status chip colors for search result cards, keyed to the same legislative
 * phases the kanban columns use (see getColumnPhaseBg in kanban-column.tsx).
 *
 * The hex values are deliberately the board's — #d6e8d4 for enacted, #f8d7d2
 * for vetoed, olive-soft for waiting — so a bill carries the same color
 * wherever a user meets it.
 *
 * NOTE ON LOCATION: this lives under src/components/, not src/lib/, because
 * Tailwind's `content` globs cover src/pages, src/components, and src/app only.
 * Class strings written in src/lib are never scanned, so the utilities they
 * name are never generated and the styles silently do not apply.
 */

export type StatusPhase =
  | 'enacted'
  | 'vetoed'
  | 'crossover'
  | 'waiting'
  | 'conference'
  | 'neutral';

/** Which legislative phase a concrete BillStatus belongs to. */
export function getStatusPhase(status: string | null | undefined): StatusPhase {
  if (!status) return 'neutral';

  if (status === 'governorSigns' || status === 'lawWithoutSignature') return 'enacted';
  if (status === 'vetoList') return 'vetoed';
  if (status.startsWith('crossover')) return 'crossover';
  if (status === 'transmittedGovernor' || status === 'passedCommittees') return 'waiting';
  if (status.startsWith('conference')) return 'conference';
  if (status === 'introduced' || status.startsWith('waiting') || status.startsWith('scheduled')) {
    return 'waiting';
  }
  return 'neutral';
}

const PHASE_CHIP_CLASSES: Record<StatusPhase, string> = {
  enacted: 'border-[#8fbf88] bg-[#d6e8d4] text-[#1e4620]',
  vetoed: 'border-[#e8a79e] bg-[#f8d7d2] text-[#7f2418]',
  // --teal-light is a mid-tone (#2C7A7C), so the chip uses a light tint of it
  // with the darker primary teal for text rather than tinting the text itself.
  crossover: 'border-teal-light/40 bg-teal-light/15 text-primary',
  waiting: 'border-olive/40 bg-olive-soft text-olive-dark',
  conference: 'border-olive/40 bg-olive-soft text-olive-dark',
  neutral: 'border-border bg-secondary/60 text-secondary-foreground',
};

export function getStatusChipClasses(status: string | null | undefined): string {
  return PHASE_CHIP_CLASSES[getStatusPhase(status)];
}
