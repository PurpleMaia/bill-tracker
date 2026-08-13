'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/contexts/auth-context';
import { KanbanBoardProvider } from '@/hooks/contexts/kanban-board-context';
import { BillsProvider } from '@/hooks/contexts/bills-context';
import { queryClient } from '@/lib/core/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Root tooltip provider: <Term> in hover mode needs an ancestor provider,
          and terms appear on nearly every surface. Existing local providers
          (e.g. kanban-card's ChipTooltip) still work — nesting is valid. */}
      <TooltipProvider delayDuration={300}>
        <AuthProvider>
          <KanbanBoardProvider>
            <BillsProvider>
              {children}
            </BillsProvider>
          </KanbanBoardProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}