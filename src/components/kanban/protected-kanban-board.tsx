'use client';

import React from 'react';
import { useAuth } from '@/hooks/contexts/auth-context';
import { KanbanBoard } from './kanban-board';
import { KanbanSpreadsheet } from './kanban-spreadsheet';
import { useTrackedBills } from '@/hooks/use-tracked-bills';
import { TrackBillDialog } from './track-bill-dialog';
import { useBills } from '@/hooks/contexts/bills-context';
import { KanbanHeader } from './kanban-header';
import { useKanbanBoard } from '@/hooks/contexts/kanban-board-context';

export function ProtectedKanbanBoardOrSpreadsheet() {
  const { user, loading, activeTenant, isPublicUser } = useAuth();
  const { view } = useKanbanBoard();
  const { bills, loadingBills, viewMode } = useBills();
  const { untrackBill } = useTrackedBills();

  if (loading) {
    return null
  }

  // If not authenticated, show read-only view of all bills
  if (!user) {
    console.log('Rendering public view with', bills.length, 'bills');
    return (
      <>
        <KanbanHeader />
        { view === 'kanban' ? <KanbanBoard readOnly={true} /> : <KanbanSpreadsheet />}
      </>
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
      <div className="space-y-4">           
        <KanbanHeader />
        <KanbanSpreadsheet />      
      </div>
    );
  }

  // Show adopted bills with full functionality
  return (
    <div className="space-y-4">           
      <KanbanHeader />
      <KanbanBoard 
        readOnly={isReadOnly || false}
        onUnadopt={untrackBill}
        showUnadoptButton={shouldShowUnadoptButton}
      />      
    </div>
  );
}
