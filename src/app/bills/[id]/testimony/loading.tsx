import { Loader2 } from 'lucide-react';

/**
 * Route-level loading UI shown during navigation while the testimony writer
 * loads — visually identical to the page's own auth/bill-loading spinner so
 * the transition hands off seamlessly.
 */
export default function TestimonyLoading() {
  return (
    <div className="flex h-dvh items-center justify-center">
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading testimony…</p>
      </div>
    </div>
  );
}
