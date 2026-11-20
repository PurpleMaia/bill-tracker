/**
 * Pure parsing of a pasted list of bill numbers ("HB 1334, SB45\nhb-12 HD1")
 * and matching it against a set of bills. Used by the bulk tag dialog.
 */

export interface BillNumberRef {
  id: string;
  bill_number: string;
}

export interface BillNumberListMatch {
  /** Ids of every bill whose number appeared in the list (all years). */
  matchedIds: string[];
  /** Canonical numbers from the list that no bill matched, in list order. */
  unmatched: string[];
}

// A chamber prefix (HB, SB, HCR, GM, ...) and a number, with an optional draft
// suffix (HD1, SD2, CD1, or the "_HD1" storage form) swallowed so it isn't
// read as a bill of its own.
const BILL_NUMBER = /\b([a-z]{1,4})[\s.-]*(\d{1,5})(?:[\s_-]*[hsc]d\d{1,2})?\b/gi;

/** "hb 1334", "HB-1334", "HB1334_HD1" → "HB1334". */
export function canonicalBillNumber(billNumber: string): string {
  return billNumber.toUpperCase().replace(/_.*$/, '').replace(/[\s.-]+/g, '');
}

/** Pulls the distinct bill numbers out of free text, in first-seen order. */
export function parseBillNumberList(text: string): string[] {
  const seen = new Set<string>();
  for (const match of text.matchAll(BILL_NUMBER)) {
    seen.add(`${match[1].toUpperCase()}${Number(match[2])}`);
  }
  return Array.from(seen);
}

export function matchBillNumberList(text: string, bills: BillNumberRef[]): BillNumberListMatch {
  const byNumber = new Map<string, string[]>();
  for (const bill of bills) {
    const key = canonicalBillNumber(bill.bill_number);
    byNumber.set(key, [...(byNumber.get(key) ?? []), bill.id]);
  }

  const matchedIds: string[] = [];
  const unmatched: string[] = [];
  for (const number of parseBillNumberList(text)) {
    const ids = byNumber.get(number);
    if (ids) matchedIds.push(...ids);
    else unmatched.push(number);
  }
  return { matchedIds, unmatched };
}
