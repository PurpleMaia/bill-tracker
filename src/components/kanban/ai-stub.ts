// One place all OPTIONAL AI features are stubbed. Swap these internals for real
// Genkit calls later; the component API stays the same. There is NO committee
// AI-draft this pass.
import type { BillDetails } from '@/types/legislation';

const STUB = '(placeholder — AI not wired yet)';

function delay<T>(value: T, ms = 900): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export function stubSummarize(text: string): Promise<string> {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return delay(
    `Plain-language recap of this ~${words}-word document will appear here once AI is connected. ${STUB}`,
  );
}

// A one-paragraph narrative that AUGMENTS the derived briefing facts. The
// briefing renders fully without ever calling this.
export function stubBriefingNarrative(bill: BillDetails): Promise<string> {
  return delay(
    `A plain-language narrative of ${bill.bill_number} — what it does, how it has changed, and what committees recommend — will appear here once AI is connected. ${STUB}`,
  );
}
