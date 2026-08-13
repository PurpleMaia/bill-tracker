'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/contexts/auth-context';
import { KanbanBoardProvider } from '@/hooks/contexts/kanban-board-context';
import { BillsProvider } from '@/hooks/contexts/bills-context';
import { queryClient } from '@/lib/core/react-query';
import { UNRESOLVED_AUTH, type InitialAuth } from '@/lib/auth/initial-auth-types';

export function Providers({
  children,
  // Server-resolved session, passed down from the root layout so AuthProvider
  // can render the correct state immediately instead of fetching after hydration.
  initialAuth = UNRESOLVED_AUTH,
}: {
  children: React.ReactNode;
  initialAuth?: InitialAuth;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider initialAuth={initialAuth}>
        <KanbanBoardProvider>
          <BillsProvider>
            {children}
          </BillsProvider>
        </KanbanBoardProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}