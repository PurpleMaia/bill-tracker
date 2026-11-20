import { cn } from '@/lib/core/utils';

/** Shared look for the Take Action filter pills (Testimony and Contact Legislators tabs). */
export function filterPillClassName(active: boolean) {
  return cn(
    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background',
    active
      ? 'border-primary bg-primary text-white'
      : 'border-border bg-background text-muted-foreground hover:text-foreground',
  );
}

export function FilterPillCount({ active, count }: { active: boolean; count: number }) {
  return (
    <span
      className={cn(
        'rounded-full px-1.5 py-0.5 text-xs font-semibold leading-none',
        active ? 'bg-white/20 text-white' : 'bg-secondary text-muted-foreground',
      )}
    >
      {count}
    </span>
  );
}
