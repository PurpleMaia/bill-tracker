import { describe, it, expect } from 'vitest';
import { deriveBillStatus } from '../derived-status';
import type { BillStatus } from '@/db/types';

describe('deriveBillStatus', () => {
  // Helper to cast strings to BillStatus
  const bs = (s: string) => s as BillStatus;

  describe('when no org statuses', () => {
    it('returns AI status when provided', () => {
      expect(deriveBillStatus(bs('introduced'), [])).toBe('introduced');
    });

    it('returns "unassigned" when AI status is null', () => {
      expect(deriveBillStatus(null, [])).toBe('unassigned');
    });
  });

  describe('mode-based consensus', () => {
    it('uses the mode when there is a clear mode', () => {
      // 3 orgs say scheduled1, 1 says introduced → mode is scheduled1
      const result = deriveBillStatus(bs('introduced'), [
        bs('scheduled1'),
        bs('scheduled1'),
        bs('scheduled1'),
        bs('introduced'),
      ]);
      expect(result).toBe('scheduled1');
    });

    it('returns AI status when consensus is behind AI', () => {
      // AI says crossoverWaiting1 (index ~7), orgs all say introduced (index 1)
      // Consensus index < AI floor → return AI
      const result = deriveBillStatus(bs('crossoverWaiting1'), [
        bs('introduced'),
        bs('introduced'),
      ]);
      expect(result).toBe('crossoverWaiting1');
    });

    it('returns consensus when consensus is ahead of AI', () => {
      // AI says introduced (index 1), orgs say scheduled1 (index 2)
      // Consensus index >= AI floor → return consensus
      const result = deriveBillStatus(bs('introduced'), [
        bs('scheduled1'),
        bs('scheduled1'),
      ]);
      expect(result).toBe('scheduled1');
    });

    it('returns consensus when consensus equals AI', () => {
      const result = deriveBillStatus(bs('introduced'), [bs('introduced')]);
      expect(result).toBe('introduced');
    });
  });

  describe('median fallback (no clear mode)', () => {
    it('uses median when all statuses are different', () => {
      // introduced (1), waiting2 (3), scheduled2 (4) → median index = 3 → waiting2
      const result = deriveBillStatus(bs('unassigned'), [
        bs('introduced'),
        bs('waiting2'),
        bs('scheduled2'),
      ]);
      expect(result).toBe('waiting2');
    });

    it('uses median of even-count tied modes', () => {
      // 2x introduced (idx 1), 2x waiting2 (idx 3) → tied mode → median of [1,1,3,3] = index 3 → waiting2
      const result = deriveBillStatus(bs('unassigned'), [
        bs('introduced'),
        bs('introduced'),
        bs('waiting2'),
        bs('waiting2'),
      ]);
      expect(result).toBe('waiting2');
    });
  });

  describe('edge cases', () => {
    it('handles single org status', () => {
      const result = deriveBillStatus(bs('unassigned'), [bs('scheduled1')]);
      expect(result).toBe('scheduled1');
    });

    it('handles AI null with org statuses', () => {
      // AI null → floor = unassigned (0), orgs say introduced → consensus > floor
      const result = deriveBillStatus(null, [bs('introduced')]);
      expect(result).toBe('introduced');
    });

    it('handles unknown status gracefully by defaulting to index 0', () => {
      // An unknown status falls back to index 0
      const result = deriveBillStatus(bs('totallyFakeStatus'), [bs('introduced')]);
      expect(result).toBe('introduced');
    });
  });
});
