'use client';

import { useEffect, useState } from 'react';
import { Building2, Loader2, User } from 'lucide-react';
import { cn } from '@/lib/core/utils';
import { useAuth } from '@/hooks/contexts/auth-context';
import { useBills } from '@/hooks/contexts/bills-context';

/**
 * Segmented control for switching between the user's own bills and the
 * whole org's bills. Self-gating: renders nothing unless the user belongs
 * to an org, so solo and public users never see a scope choice.
 */
export function ViewScopeToggle({ className }: { className?: string }) {
  const { activeTenant } = useAuth();
  const { viewMode, toggleViewMode, loadingBills } = useBills();

  // Track which segment was just clicked so we can show a pending spinner
  // on it while the refetch is in flight.
  const [pendingMode, setPendingMode] = useState<'my-bills' | 'all-bills' | null>(null);

  useEffect(() => {
    if (!loadingBills) setPendingMode(null);
  }, [loadingBills]);

  if (!activeTenant) return null;

  const segments = [
    { mode: 'my-bills' as const, label: 'My Bills', Icon: User },
    { mode: 'all-bills' as const, label: activeTenant.name, Icon: Building2 },
  ];

  return (
    <div
      role="group"
      aria-label="Bill view scope"
      className={cn('inline-flex items-center gap-0.5 rounded-lg bg-muted p-1', className)}
    >
      {segments.map(({ mode, label, Icon }) => {
        const active = viewMode === mode;
        const pending = pendingMode === mode && loadingBills;
        return (
          <button
            key={mode}
            type="button"
            aria-pressed={active}
            title={label}
            onClick={() => {
              if (!active) {
                setPendingMode(mode);
                toggleViewMode();
              }
            }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
            ) : (
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
            <span className="max-w-[140px] truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
