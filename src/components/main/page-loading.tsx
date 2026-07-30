import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/core/utils';

/**
 * Centered page-level loading state, used by route loading.tsx fallbacks
 * and auth-resolution gaps so navigation never paints a blank screen.
 */
export function PageLoading({
  label = 'Loading…',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex h-full min-h-[50dvh] flex-1 flex-col items-center justify-center gap-3 text-muted-foreground',
        className
      )}
    >
      <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
