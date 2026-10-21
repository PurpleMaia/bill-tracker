'use client';

// Bridges ActiveBoardsContext data into the shape KanbanBoard/Card read from
// useBills(). Active Boards is read-only (boardMode="active-boards"), so every
// mutating member below is a no-op that never fires. The value is typed
// BillsContextType (no `as any`) so the compiler enforces that this mirror
// stays field-for-field in sync with the real interface.
import React from 'react';
import { BillsContext, type BillsContextType } from '@/hooks/contexts/bills-context';
import { useActiveBoards } from '@/hooks/contexts/active-boards-context';

export function ActiveBoardsBillsBridge({ children }: { children: React.ReactNode }) {
  const { bills, loadingBills } = useActiveBoards();
  const asyncNoop = async () => {};

  const value: BillsContextType = {
    // State
    loadingBills,
    setLoadingBills: () => {},
    bills,
    setBills: () => {},
    tempBills: [],
    setTempBills: () => {},

    // LLM Suggestion Controls
    acceptLLMChange: asyncNoop,
    rejectLLMChange: asyncNoop,
    rejectAllLLMChanges: asyncNoop,
    acceptAllLLMChanges: asyncNoop,

    // Human Proposal Controls
    proposeStatusChange: asyncNoop,
    acceptTempChange: asyncNoop,
    rejectTempChange: asyncNoop,
    acceptAllTempChanges: asyncNoop,
    rejectAllTempChanges: asyncNoop,
    undoProposal: asyncNoop,

    // View Mode
    viewMode: 'all-bills',
    setViewMode: () => {},
    toggleViewMode: () => {},

    // Archived Toggle
    showArchived: false,
    setShowArchived: () => {},
    toggleShowArchived: () => {},

    // Bill CRUD
    addBill: () => {},
    updateBill: () => {},
    removeBill: () => {},

    // Data Operations
    resetBills: asyncNoop,
    refreshBills: asyncNoop,

    // Testimony progress (current user)
    testimonyStatuses: {},
    refreshTestimonyStatuses: asyncNoop,
  };

  return <BillsContext.Provider value={value}>{children}</BillsContext.Provider>;
}
