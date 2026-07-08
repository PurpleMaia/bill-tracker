'use client';

import React, { useEffect } from 'react';
import { useAuth } from '@/hooks/contexts/auth-context';
import { KanbanBoard } from './kanban-board';
import { KanbanSpreadsheet } from './kanban-spreadsheet';
import { useTrackedBills } from '@/hooks/use-tracked-bills';
import { TrackBillDialog } from './track-bill-dialog';
import { useBills } from '@/hooks/contexts/bills-context';
import { KanbanHeader } from './kanban-header';
import { useKanbanBoard } from '@/hooks/contexts/kanban-board-context';
import KanbanBoardSkeleton from './skeletons/skeleton-board';

export function ProtectedKanbanBoardOrSpreadsheet() {
  const { user, loading, activeTenant, isPublicUser, preferences } = useAuth();
  const { view, setColumnView } = useKanbanBoard();
  const { bills, loadingBills, viewMode } = useBills();
  const { untrackBill } = useTrackedBills();

  // Drive the board's column view from the user's saved preference. Seeds on
  // load and live-syncs whenever the preference changes (e.g. via the settings
  // dialog). Public/logged-out users have no preferences and keep the context
  // default ('simplified').
  useEffect(() => {
    if (!preferences) return;
    setColumnView(preferences.kanban_detailed_view ? 'detailed' : 'simplified');
  }, [preferences, setColumnView]);

  if (loading) {
    return (
      <div className="min-h-0 w-full flex-1 overflow-hidden p-2 md:p-4">
        <KanbanBoardSkeleton />
      </div>
    );
  }

  // If not authenticated, show read-only view of all bills
  if (!user) {
    console.log('Rendering public view with', bills.length, 'bills');
    return (
      <div className="flex h-full min-h-0 flex-col">
        <KanbanHeader />
        { view === 'kanban' ? <KanbanBoard readOnly={true} /> : <KanbanSpreadsheet />}
      </div>
    );
  }


  // Show empty state only when viewing "my-bills" with no tracked bills
  if (user && bills.length === 0 && !loadingBills && viewMode === 'my-bills') {
    return (
      <>
        <KanbanHeader />
        <div className="flex flex-col items-center justify-center h-full space-y-6 p-8">
          <div className="text-center space-y-4">
            <h2 className="text-2xl font-semibold">No Tracked Bills Yet</h2>
            <p className="text-muted-foreground max-w-md">
              Click Track Bill in the header to get started.
            </p>
          </div>
        </div>
      </>
    );
  }

  // Determine if editing should be disabled
  // Public users and workers viewing "all-bills" mode are read-only
  const isReadOnly = isPublicUser || (activeTenant?.orgRole === 'worker' && viewMode === 'all-bills');
  const shouldShowUnadoptButton = user && (activeTenant?.orgRole === 'admin' || viewMode === 'my-bills');

  if (view === 'spreadsheet') {
    // Show adopted bills in spreadsheet view
    return (
      <div className="flex h-full min-h-0 flex-col">
        <KanbanHeader />
        <KanbanSpreadsheet />
      </div>
    );
  }

  // Show adopted bills with full functionality
  return (
    <div className="flex h-full min-h-0 flex-col">
      <KanbanHeader />
      <KanbanBoard 
        readOnly={isReadOnly || false}
        onUnadopt={untrackBill}
        showUnadoptButton={shouldShowUnadoptButton}
      />      
    </div>
  );
}
