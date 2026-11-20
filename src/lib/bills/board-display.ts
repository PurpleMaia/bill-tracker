export type BoardMode = 'own' | 'active-boards';

export interface CardVisibility {
  showTestimonyAlert: boolean;
  showTrackedCount: boolean;
  showLlmActions: boolean;
  showRemoveAssign: boolean;
  showTrackForSelf: boolean;
}

/**
 * What controls a bill card renders, by board surface. Active Boards is a
 * read-only view of another org's board: owner-only controls are hidden and a
 * single "track into my own context" action is enabled instead. Tracking needs
 * an account, so signed-out viewers of a public board don't get it.
 */
export function cardVisibility(
  mode: BoardMode,
  { signedIn = true }: { signedIn?: boolean } = {},
): CardVisibility {
  const activeBoards = mode === 'active-boards';
  return {
    showTestimonyAlert: !activeBoards,
    showTrackedCount: !activeBoards,
    showLlmActions: !activeBoards,
    showRemoveAssign: !activeBoards,
    showTrackForSelf: activeBoards && signedIn,
  };
}
