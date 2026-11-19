import { isEnacted } from '@/lib/bills/dead-bill';
import { getGovernorStage } from '@/lib/legislators/governor-contact';
import { isConferenceStatus } from '@/lib/testimony/conferees';
import { HAWAII_TIME_ZONE } from '@/lib/testimony/hearing-schedule';

/**
 * What a contact asks for, by where the bill is:
 * - `hearing`      — waiting on a committee: ask the chair to schedule a hearing.
 * - `conference`   — in conference: ask the conferees to reach agreement.
 * - `governor`     — with the Governor: ask them to sign.
 * - `intentToVeto` — on the intent-to-veto list: ask them to reconsider.
 * - `override`     — vetoed: ask legislators to override.
 */
export type ContactStage = 'hearing' | 'conference' | 'governor' | 'intentToVeto' | 'override';

export const CONTACT_STAGES: readonly ContactStage[] = [
  'hearing',
  'conference',
  'governor',
  'intentToVeto',
  'override',
];

/** The ask, phrased as the action the user takes. */
export const CONTACT_STAGE_ACTIONS: Record<ContactStage, string> = {
  hearing: 'Request a hearing',
  conference: 'Contact conferees',
  governor: 'Ask the Governor to sign',
  intentToVeto: 'Ask the Governor to reconsider',
  override: 'Urge a veto override',
};

export type ContactMethod = 'email' | 'call' | 'form' | 'meeting' | 'other';

export const CONTACT_METHODS: readonly ContactMethod[] = ['email', 'call', 'form', 'meeting', 'other'];

export const CONTACT_METHOD_LABELS: Record<ContactMethod, string> = {
  email: 'Email',
  call: 'Phone call',
  form: 'Online form',
  meeting: 'Meeting',
  other: 'Other',
};

export function isContactStage(value: unknown): value is ContactStage {
  return typeof value === 'string' && (CONTACT_STAGES as readonly string[]).includes(value);
}

/** Most recipients one "Mark as contacted" save may log (enforced server-side too). */
export const MAX_CONTACT_RECIPIENTS = 20;

export function isContactMethod(value: unknown): value is ContactMethod {
  return typeof value === 'string' && (CONTACT_METHODS as readonly string[]).includes(value);
}

/**
 * Statuses where the bill is waiting for a committee to schedule its hearing —
 * the only pre-conference statuses where asking for a hearing makes sense. A
 * scheduled bill already has one (that's a time for testimony), and a deferred
 * or unreferred bill has no chair to ask.
 */
const AWAITING_HEARING_STATUSES: ReadonlySet<string> = new Set([
  'introduced',
  'waiting2',
  'waiting3',
  'crossoverWaiting1',
  'crossoverWaiting2',
  'crossoverWaiting3',
]);

export interface ContactStageInput {
  status: string | null | undefined;
  dead: boolean;
  /** The bill's latest status line — tells a final veto from an intent to veto. */
  latestStatusText?: string | null;
  /** The full history has a final veto, even if the latest line isn't it. */
  finalVeto?: boolean;
}

/**
 * Where contacting someone can move this bill right now, or null when there
 * is no one useful to contact: enacted, failed, or between stages (e.g. a
 * hearing is already scheduled).
 */
export function getContactStage({ status, dead, latestStatusText, finalVeto }: ContactStageInput): ContactStage | null {
  if (isEnacted(status)) return null;
  const governor =
    finalVeto && status === 'vetoList'
      ? 'vetoed'
      : getGovernorStage(status, latestStatusText ? [{ statustext: latestStatusText }] : []);
  if (governor) {
    if (dead) return null;
    if (governor === 'vetoed') return 'override';
    return governor === 'intentToVeto' ? 'intentToVeto' : 'governor';
  }
  if (dead) return null;
  if (isConferenceStatus(status)) return 'conference';
  if (status && AWAITING_HEARING_STATUSES.has(status)) return 'hearing';
  return null;
}

/**
 * A Capitol status date ("4/15/2026", or ISO "2026-04-15…") as YYYY-MM-DD;
 * null when it can't be read.
 */
export function parseStatusDate(date: string | null | undefined): string | null {
  const text = date?.trim();
  if (!text) return null;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (us) {
    const [, m, d, y] = us;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

/** The Hawaiʻi calendar day (YYYY-MM-DD) of an instant. */
export function hawaiiDay(instant: string | Date): string {
  // en-CA formats as YYYY-MM-DD.
  return new Date(instant).toLocaleDateString('en-CA', { timeZone: HAWAII_TIME_ZONE });
}

/** The fields of a logged contact this module needs. */
export interface ContactRecord {
  billId: string;
  stage: ContactStage;
  contactedAt: string;
}

/**
 * True when one of `contacts` already answers the bill's current ask: same
 * stage, made on or after the day the bill last moved. A bill that moves on
 * (say from its first committee to its second) asks again, even though the
 * stage is still `hearing`. Without a readable status date, any same-stage
 * contact counts.
 */
export function coversCurrentStage(
  contacts: readonly ContactRecord[],
  stage: ContactStage,
  latestUpdateDate: string | null | undefined,
): boolean {
  const since = parseStatusDate(latestUpdateDate);
  return contacts.some(
    (contact) => contact.stage === stage && (since === null || hawaiiDay(contact.contactedAt) >= since),
  );
}

/** The minimal bill shape the opportunity list reads (a `Bill` fits). */
export interface ContactableBill {
  id: string;
  bill_number: string;
  current_bill_status: string;
  dead: boolean;
  archived: boolean;
  latest_update: { statustext: string; date: string } | null;
  final_veto?: boolean;
}

export interface ContactOpportunity<B extends ContactableBill, C extends ContactRecord> {
  bill: B;
  /** The current ask; null for a bill in `earlier` (nothing to ask right now). */
  stage: ContactStage | null;
  /** Every logged contact for the bill, newest first (any stage). */
  contacts: C[];
  /** A contact already answers the current ask. */
  covered: boolean;
}

/**
 * Splits bills into those to contact now (no contact yet for the current ask),
 * those already contacted for it, and `earlier`: bills with past contacts but
 * nothing to ask right now (e.g. the hearing was scheduled). Archived bills and
 * bills with neither an ask nor contacts are dropped. To-contact bills keep the
 * caller's order; the other two sort by latest contact, newest first.
 */
export function buildContactOpportunities<B extends ContactableBill, C extends ContactRecord>(
  bills: readonly B[],
  contacts: readonly C[],
): {
  toContact: ContactOpportunity<B, C>[];
  contacted: ContactOpportunity<B, C>[];
  earlier: ContactOpportunity<B, C>[];
} {
  const byBill = new Map<string, C[]>();
  for (const contact of contacts) {
    const list = byBill.get(contact.billId) ?? [];
    list.push(contact);
    byBill.set(contact.billId, list);
  }
  for (const list of byBill.values()) {
    list.sort((a, b) => b.contactedAt.localeCompare(a.contactedAt));
  }

  const toContact: ContactOpportunity<B, C>[] = [];
  const contacted: ContactOpportunity<B, C>[] = [];
  const earlier: ContactOpportunity<B, C>[] = [];
  const seen = new Set<string>();

  for (const bill of bills) {
    if (seen.has(bill.id) || bill.archived) continue;
    seen.add(bill.id);
    const stage = getContactStage({
      status: bill.current_bill_status,
      dead: bill.dead,
      latestStatusText: bill.latest_update?.statustext ?? null,
      finalVeto: bill.final_veto,
    });
    const billContacts = byBill.get(bill.id) ?? [];
    if (!stage) {
      if (billContacts.length > 0) earlier.push({ bill, stage: null, contacts: billContacts, covered: false });
      continue;
    }
    const covered = coversCurrentStage(billContacts, stage, bill.latest_update?.date);
    (covered ? contacted : toContact).push({ bill, stage, contacts: billContacts, covered });
  }

  const newestFirst = (a: ContactOpportunity<B, C>, b: ContactOpportunity<B, C>) =>
    b.contacts[0].contactedAt.localeCompare(a.contacts[0].contactedAt);
  contacted.sort(newestFirst);
  earlier.sort(newestFirst);
  return { toContact, contacted, earlier };
}
