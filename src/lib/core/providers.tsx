'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/contexts/auth-context';
import { KanbanBoardProvider } from '@/hooks/contexts/kanban-board-context';
import { BillsProvider } from '@/hooks/contexts/bills-context';
import { CommitteeNamesProvider } from '@/hooks/contexts/committee-names-context';
import { queryClient } from '@/lib/core/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
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
      {/* Root tooltip provider: <Term> in hover mode needs an ancestor provider,
          and terms appear on nearly every surface. Existing local providers
          (e.g. kanban-card's ChipTooltip) still work — nesting is valid. */}
      <TooltipProvider delayDuration={300}>
        <AuthProvider>
          <KanbanBoardProvider>
            <BillsProvider>
              <CommitteeNamesProvider>
                {children}
              </CommitteeNamesProvider>
            </BillsProvider>
          </KanbanBoardProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}