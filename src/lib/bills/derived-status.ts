import { KANBAN_COLUMNS, COLUMN_INDEX } from '@/lib/bills/kanban-columns';
import type { BillStatus } from '@/db/types';

const EXTENDED_INDEX: Record<string, number> = {
  ...COLUMN_INDEX,
  deferred1: COLUMN_INDEX['scheduled1'] ?? 2,
  deferred2: COLUMN_INDEX['scheduled2'] ?? 4,
  deferred3: COLUMN_INDEX['scheduled3'] ?? 6,
  crossoverDeferred1: COLUMN_INDEX['crossoverScheduled1'] ?? 8,
  crossoverDeferred2: COLUMN_INDEX['crossoverScheduled2'] ?? 10,
  crossoverDeferred3: COLUMN_INDEX['crossoverScheduled3'] ?? 12,
  conferenceDeferred: COLUMN_INDEX['conferenceScheduled'] ?? 15,
};

/**
 * Pure function: computes the derived public status from AI + org statuses.
 * Algorithm B: AI as floor, org consensus as ceiling.
 *
 * 1. If no org statuses → return aiStatus
 * 2. floor = pipeline index of aiStatus
 * 3. consensus = mode of org statuses (median if no mode)
 * 4. If consensus < floor → return aiStatus (orgs behind official records)
 * 5. If consensus >= floor → return consensus (orgs have fresher info)
 */
export function deriveBillStatus(
  aiStatus: BillStatus | null,
  orgStatuses: BillStatus[]
): BillStatus {
  const fallback: BillStatus = 'unassigned';
  const ai = aiStatus ?? fallback;

  if (orgStatuses.length === 0) {
    return ai;
  }

  const floor = EXTENDED_INDEX[ai] ?? 0;

  // Compute mode
  const frequencyMap = new Map<BillStatus, number>();
  for (const status of orgStatuses) {
    frequencyMap.set(status, (frequencyMap.get(status) ?? 0) + 1);
  }

  let maxFreq = 0;
  let modes: BillStatus[] = [];
  for (const [status, count] of frequencyMap) {
    if (count > maxFreq) {
      maxFreq = count;
      modes = [status];
    } else if (count === maxFreq) {
      modes.push(status);
    }
  }

  let consensus: BillStatus;
  if (modes.length === 1) {
    // Clear mode
    consensus = modes[0];
  } else {
    // No clear mode — use median index
    const sortedIndices = orgStatuses
      .map(s => EXTENDED_INDEX[s] ?? 0)
      .sort((a, b) => a - b);
    const medianIdx = sortedIndices[Math.floor(sortedIndices.length / 2)];
    const medianColumn = KANBAN_COLUMNS[medianIdx];
    consensus = (medianColumn?.id ?? fallback) as BillStatus;
  }

  const consensusIndex = EXTENDED_INDEX[consensus] ?? 0;

  if (consensusIndex < floor) {
    return ai;
  }

  return consensus;
}

// The DB-backed recomputeDerivedStatus() lives in @/db/queries/derived-status
// so this module stays pure (no DB import) and unit-testable.
