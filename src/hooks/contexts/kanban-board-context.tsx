'use client';

import React, { createContext, useCallback, useContext, useState, useEffect, useRef, ReactNode, Dispatch, SetStateAction } from 'react';
import { loadBoardFilters, saveBoardFilters } from '@/lib/bills/board-filter-storage';

/** The four legislative phases the jump pills scroll the board to. */
export type BoardPhase = 'introduced' | 'crossover' | 'conference' | 'governor';

interface KanbanBoardContextType {
  view: 'kanban' | 'spreadsheet' | 'calendar' | 'admin' | 'supervisor';
  setView: Dispatch<SetStateAction<'kanban' | 'spreadsheet' | 'calendar' | 'admin' | 'supervisor'>>;
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
  /**
   * The phase pills live in the header but the columns (and their refs) live in
   * KanbanBoard, so the board registers its scroller here (null on unmount)
   * and the header calls scrollToPhase. A no-op while no board is mounted.
   */
  registerPhaseScroll: (fn: ((phase: BoardPhase) => void) | null) => void;
  scrollToPhase: (phase: BoardPhase) => void;
  /** True while a board is registered — the header hides the pills otherwise. */
  phaseScrollAvailable: boolean;
}

const KanbanBoardContext = createContext<KanbanBoardContextType | undefined>(undefined);

export function KanbanBoardProvider({ children }: { children: ReactNode }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState<'kanban' | 'spreadsheet' | 'calendar' | 'admin' | 'supervisor'>('kanban');
  const [columnView, setColumnView] = useState<'detailed' | 'simplified'>('simplified');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [deadFilter, setDeadFilter] = useState<'all' | 'dead' | 'alive'>('all');
  // The scroller itself is a ref (re-registering on column changes shouldn't
  // re-render consumers); only whether one exists is state.
  const phaseScrollRef = useRef<((phase: BoardPhase) => void) | null>(null);
  const [phaseScrollAvailable, setPhaseScrollAvailable] = useState(false);
  const registerPhaseScroll = useCallback((fn: ((phase: BoardPhase) => void) | null) => {
    phaseScrollRef.current = fn;
    setPhaseScrollAvailable(fn !== null);
  }, []);
  const scrollToPhase = useCallback((phase: BoardPhase) => phaseScrollRef.current?.(phase), []);

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
    <KanbanBoardContext.Provider value={{ searchQuery, setSearchQuery, view, setView, columnView, setColumnView, selectedTagIds, setSelectedTagIds, selectedYears, setSelectedYears, deadFilter, setDeadFilter, registerPhaseScroll, scrollToPhase, phaseScrollAvailable }}>
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
