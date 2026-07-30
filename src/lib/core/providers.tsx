'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/contexts/auth-context';
import { KanbanBoardProvider } from '@/hooks/contexts/kanban-board-context';
import { BillsProvider } from '@/hooks/contexts/bills-context';
import { queryClient } from '@/lib/react-query';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <KanbanBoardProvider>
          <BillsProvider>
            {children}
          </BillsProvider>
        </KanbanBoardProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}