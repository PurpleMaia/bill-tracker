import { findPermanentDeferral } from '@/lib/bills/dead-bill';

/**
 * Calendar milestones — the dated moments in a bill's life that the Calendar
 * view marks. Pure derivation from a bill's action history (status_updates);
 * no DB access.
 */

export type MilestoneType = 'introduced' | 'crossover' | 'conference' | 'governor' | 'failed';

/** Display order, matching the legend in the calendar mockup. */
export const MILESTONE_TYPES: readonly MilestoneType[] = [
  'introduced',
  'crossover',
  'conference',
  'governor',
  'failed',
];

export const MILESTONE_META: Record<
  MilestoneType,
  { label: string; dotClass: string; rowClass: string }
> = {
  introduced: { label: 'Introduced', dotClass: 'bg-yellow-400', rowClass: 'bg-yellow-100' },
  crossover: { label: 'Crossover', dotClass: 'bg-orange-400', rowClass: 'bg-orange-100' },
  conference: { label: 'Conference', dotClass: 'bg-cyan-400', rowClass: 'bg-cyan-100' },
  governor: { label: 'Governor', dotClass: 'bg-green-500', rowClass: 'bg-green-100' },
  failed: { label: 'Failed', dotClass: 'bg-red-500', rowClass: 'bg-red-100' },
};

export interface MilestoneUpdate {
  date: string;
  statustext: string;
  chamber?: string;
}

export interface MilestoneBill {
  id: string;
  bill_number: string;
  bill_title: string;
  nickname?: string | null;
  dead: boolean;
  latest_update?: { date: string; statustext: string } | null;
}

export interface BillMilestone {
  /** Unique per bill + type, safe as a React key. */
  id: string;
  billId: string;
  billNumber: string;
  billTitle: string;
  type: MilestoneType;
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  /** The action text that produced this milestone. */
  detail: string;
}

/**
 * Normalize a status-update date to a local YYYY-MM-DD day. The scraper stores
 * both ISO ("2026-02-12") and M/D/YYYY strings. ISO strings are sliced rather
 * than parsed so a UTC-midnight timestamp can't shift to the previous day.
 */
export function toIsoDay(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getDate()).padStart(2, '0');
  return `${parsed.getFullYear()}-${mm}-${dd}`;
}

const PATTERNS: ReadonlyArray<readonly [Exclude<MilestoneType, 'failed'>, RegExp]> = [
  ['introduced', /^\s*introduced\b/],
  ['crossover', /transmitted to (the )?(senate|house)\b/],
  ['conference', /\bconferees?\b|\bconference committee\b/],
  [
    'governor',
    /(transmitted|enrolled|presented) to (the )?governor|\bvetoed?\b|\bact \d+\b|without (his|her|the governor'?s) signature/,
  ],
];

/** Classify one action's text into a milestone, or null if it isn't one. */
export function classifyUpdate(statustext: string): Exclude<MilestoneType, 'failed'> | null {
  const text = statustext.toLowerCase();
  for (const [type, pattern] of PATTERNS) {
    if (pattern.test(text)) return type;
  }
  return null;
}

/**
 * Derive a bill's milestones. Each non-failure type is reported once, at its
 * earliest matching action. `failed` is reported only for dead bills, dated at
 * the permanent deferral when there is one, otherwise the last recorded action.
 */
export function extractMilestones(
  bill: MilestoneBill,
  updates: readonly MilestoneUpdate[],
): BillMilestone[] {
  const dated = updates
    .map((u) => ({ day: toIsoDay(u.date), text: u.statustext }))
    .filter((u): u is { day: string; text: string } => u.day !== null && !!u.text)
    .sort((a, b) => a.day.localeCompare(b.day));

  const make = (type: MilestoneType, date: string, detail: string): BillMilestone => ({
    id: `${bill.id}:${type}`,
    billId: bill.id,
    billNumber: bill.bill_number,
    billTitle: bill.nickname || bill.bill_title,
    type,
    date,
    detail,
  });

  const found = new Map<MilestoneType, BillMilestone>();
  for (const u of dated) {
    const type = classifyUpdate(u.text);
    if (type && !found.has(type)) found.set(type, make(type, u.day, u.text));
  }

  if (bill.dead) {
    const deferral = findPermanentDeferral(
      updates.map((u) => ({ date: u.date, statustext: u.statustext, chamber: u.chamber ?? '' })),
    );
    const deferralDay = deferral ? toIsoDay(deferral.date) : null;
    const last = dated[dated.length - 1];
    const latest = toIsoDay(bill.latest_update?.date);
    const day = deferralDay ?? last?.day ?? latest;
    if (day) {
      found.set(
        'failed',
        make('failed', day, deferral?.statustext ?? last?.text ?? bill.latest_update?.statustext ?? ''),
      );
    }
  }

  return MILESTONE_TYPES.flatMap((t) => found.get(t) ?? []).sort(
    (a, b) => a.date.localeCompare(b.date) || a.billNumber.localeCompare(b.billNumber),
  );
}

/** Group milestones by their YYYY-MM-DD day. */
export function groupByDay(milestones: readonly BillMilestone[]): Map<string, BillMilestone[]> {
  const byDay = new Map<string, BillMilestone[]>();
  for (const m of milestones) {
    const list = byDay.get(m.date);
    if (list) list.push(m);
    else byDay.set(m.date, [m]);
  }
  return byDay;
}

/** Milestones falling in a month (monthKey is "YYYY-MM"), in date order. */
export function milestonesInMonth(
  milestones: readonly BillMilestone[],
  monthKey: string,
): BillMilestone[] {
  return milestones.filter((m) => m.date.startsWith(monthKey));
}
