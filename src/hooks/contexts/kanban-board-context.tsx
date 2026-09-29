'use client';

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode, Dispatch, SetStateAction } from 'react';
import { loadBoardFilters, saveBoardFilters } from '@/lib/bills/board-filter-storage';

interface KanbanBoardContextType {
  view: 'kanban' | 'spreadsheet' | 'admin' | 'supervisor';
  setView: Dispatch<SetStateAction<'kanban' | 'spreadsheet' | 'admin' | 'supervisor'>>;
  columnView: 'detailed' | 'simplified';
  setColumnView: Dispatch<SetStateAction<'detailed' | 'simplified'>>;
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  selectedTagIds: string[];
  setSelectedTagIds: Dispatch<SetStateAction<string[]>>;
  selectedYears: number[];
  setSelectedYears: Dispatch<SetStateAction<number[]>>;
  deadFilter: 'all' | 'dead' | 'alive';
  setDeadFilter: Dispatch<SetStateAction<'all' | 'dead' | 'alive'>>;
}

const KanbanBoardContext = createContext<KanbanBoardContextType | undefined>(undefined);

export function KanbanBoardProvider({ children }: { children: ReactNode }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState<'kanban' | 'spreadsheet' | 'admin' | 'supervisor'>('kanban');
  const [columnView, setColumnView] = useState<'detailed' | 'simplified'>('simplified');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [deadFilter, setDeadFilter] = useState<'all' | 'dead' | 'alive'>('all');

  // Hydrate the filter fields from localStorage AFTER mount. It must run in an
  // effect, not a lazy useState initializer: this is a client component but
  // Next SSRs it with no `window`, and React does not re-run lazy initializers
  // during hydration — so a lazy read would lock in defaults on the client.
  // `hydrated` gates the persist effect below so it can't clobber stored filters
  // with the initial defaults before this restore runs. View state (view,
  // columnView) is not persisted here — it's driven by preferences/routing.
  const hydrated = useRef(false);
  useEffect(() => {
    const stored = loadBoardFilters();
    if (stored) {
      setSearchQuery(stored.searchQuery);
      setSelectedTagIds(stored.selectedTagIds);
      setSelectedYears(stored.selectedYears);
      setDeadFilter(stored.deadFilter);
    }
    hydrated.current = true;
  }, []);

  // Persist filter changes so they outlive a reload. Skip writes until the
  // restore effect above has run, so the initial defaults never overwrite
  // what's already stored.
  useEffect(() => {
    if (!hydrated.current) return;
    saveBoardFilters({ searchQuery, selectedTagIds, selectedYears, deadFilter });
  }, [searchQuery, selectedTagIds, selectedYears, deadFilter]);

  return (
    <KanbanBoardContext.Provider value={{ searchQuery, setSearchQuery, view, setView, columnView, setColumnView, selectedTagIds, setSelectedTagIds, selectedYears, setSelectedYears, deadFilter, setDeadFilter }}>
      {children}
    </KanbanBoardContext.Provider>
  );
}

export function useKanbanBoard() {
  const context = useContext(KanbanBoardContext);
  if (context === undefined) {
    throw new Error('useKanbanBoard must be used within a KanbanBoardProvider');
  }
  return context;
}
