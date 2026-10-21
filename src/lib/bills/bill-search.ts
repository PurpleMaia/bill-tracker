/**
 * Pure client-side bill search: tiered relevance scoring with bounded
 * typo tolerance. No DB access — safe for src/lib per project convention.
 */

export interface SearchableBill {
  id: string;
  bill_number: string;
  bill_title: string;
  description: string;
}

// Score tiers, high to low. A bill's score for a token is its best tier;
// a bill's total is the sum over tokens. Any zero-scoring token excludes the bill.
const NUMBER_EXACT = 100;
const NUMBER_PREFIX = 80;
const NUMBER_SUBSTRING = 60;
const TITLE_SUBSTRING = 40;
const DESCRIPTION_SUBSTRING = 20;
const TITLE_FUZZY = 10;
const DESCRIPTION_FUZZY = 5;

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Collapse spaces/hyphens so "sb 123" and "sb-123" compare against "SB123". */
function compact(s: string): string {
  return s.toLowerCase().replace(/[\s-]+/g, '');
}

function maxEditsFor(token: string): number {
  if (token.length >= 9) return 2;
  if (token.length >= 5) return 1;
  return 0;
}

/** Bounded Levenshtein: true if edit distance(a, b) <= maxEdits. Early-exits per row. */
function withinEditDistance(a: string, b: string, maxEdits: number): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > maxEdits) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const curr: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxEdits) return false;
    prev = curr;
  }
  return prev[b.length] <= maxEdits;
}

function fuzzyWordMatch(text: string, token: string, maxEdits: number): boolean {
  return text
    .split(' ')
    .some(word => withinEditDistance(word.replace(/[^a-z0-9]/g, ''), token, maxEdits));
}

function scoreToken(bill: SearchableBill, token: string): number {
  const compactToken = compact(token);
  const number = compact(bill.bill_number);
  const id = compact(bill.id);

  if (number === compactToken || id === compactToken) return NUMBER_EXACT;
  if (number.startsWith(compactToken) || id.startsWith(compactToken)) return NUMBER_PREFIX;
  if (number.includes(compactToken) || id.includes(compactToken)) return NUMBER_SUBSTRING;

  const title = normalize(bill.bill_title);
  if (title.includes(token)) return TITLE_SUBSTRING;

  const description = normalize(bill.description);
  if (description.includes(token)) return DESCRIPTION_SUBSTRING;

  const maxEdits = maxEditsFor(token);
  if (maxEdits > 0) {
    if (fuzzyWordMatch(title, token, maxEdits)) return TITLE_FUZZY;
    if (fuzzyWordMatch(description, token, maxEdits)) return DESCRIPTION_FUZZY;
  }
  return 0;
}

/**
 * Filter and rank bills against a query. Every whitespace-separated token
 * must match somewhere (AND); results are ordered best-match-first with
 * ties keeping input order. Empty/whitespace queries return the input array.
 */
export function searchBillsLocal<T extends SearchableBill>(bills: T[], query: string): T[] {
  const normalized = normalize(query);
  if (!normalized) return bills;
  const tokens = normalized.split(' ');

  const scored: Array<{ bill: T; score: number }> = [];
  for (const bill of bills) {
    let total = 0;
    for (const token of tokens) {
      const s = scoreToken(bill, token);
      if (s === 0) { total = 0; break; }
      total += s;
    }
    if (total > 0) scored.push({ bill, score: total });
  }
  // Array.prototype.sort is stable — equal scores keep input order.
  return scored.sort((a, b) => b.score - a.score).map(s => s.bill);
}
