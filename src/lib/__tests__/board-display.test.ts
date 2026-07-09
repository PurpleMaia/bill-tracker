import { describe, it, expect } from 'vitest';
import { cardVisibility } from '@/lib/board-display';

describe('cardVisibility', () => {
  it('own mode shows all owner controls', () => {
    expect(cardVisibility('own')).toEqual({
      showTestimonyAlert: true,
      showTrackedCount: true,
      showLlmActions: true,
      showRemoveAssign: true,
      showTrackForSelf: false,
    });
  });

  it('active-boards mode hides owner controls and enables track-for-self', () => {
    expect(cardVisibility('active-boards')).toEqual({
      showTestimonyAlert: false,
      showTrackedCount: false,
      showLlmActions: false,
      showRemoveAssign: false,
      showTrackForSelf: true,
    });
  });
});
