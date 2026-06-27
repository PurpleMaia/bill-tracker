'use client';

import React, { createContext, useContext, useState, ReactNode, Dispatch, SetStateAction } from 'react';

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
