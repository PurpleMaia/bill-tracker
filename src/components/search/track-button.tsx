'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoginLink } from '@/components/auth/login-link';
import { useAuth } from '@/hooks/contexts/auth-context';
import { useBills } from '@/hooks/contexts/bills-context';
import { useToast } from '@/hooks/use-toast';
import { useViewOnBoard } from '@/hooks/use-view-on-board';
import { ToastAction } from '@/components/ui/toast';
import { data } from '@/lib/data-client';
import { cn } from '@/lib/core/utils';

/**
 * Icon-only below `sm`, full "Track Bill" label above it.
 *
 * At 375px the labelled button was 111px wide — roughly a third of the card's
 * header row — which crowded the bill number and status badges. Square and
 * 36px keeps it a comfortable tap target while giving the badges their space
 * back; the aria-label carries the meaning the hidden text would have.
 */
const COMPACT_ON_MOBILE = 'h-9 w-9 p-0 sm:h-9 sm:w-auto sm:px-3';

interface TrackButtonProps {
  billId: string;
  billNumber: string;
  /**
   * Seeds the tracked state so a bill the user already tracks shows "Tracked"
   * on mount, rather than only after a click. Comes from BillSearchResult.
   * is_tracked (resolved server-side); defaults to false for logged-out search.
   */
  initialTracked?: boolean;
  /**
   * Shorter form used on Find Bills (results and recommendations): "Track"
   * instead of the board's "Track Bill" wording, with no extra icon margin.
   */
  compact?: boolean;
  /** Extra classes, merged last (e.g. a smaller size inside the recommendations panel). */
  className?: string;
}

/**
 * Tracks a bill to the user's active org board. For logged-out visitors the
 * same button links to /login, which returns them to these search results.
 */
export function TrackButton({
  billId,
  billNumber,
  initialTracked = false,
  compact = false,
  className,
}: TrackButtonProps) {
  const trackLabel = compact ? 'Track' : 'Track Bill';
  // Button already spaces icon and label (gap-2); the compact form adds no margin.
  const iconGap = compact ? '' : 'sm:mr-1.5';

  const { user, activeTenant } = useAuth();
  const { toast } = useToast();
  const { refreshBills } = useBills();
  const queryClient = useQueryClient();
  const viewOnBoard = useViewOnBoard();
  const [isTracking, setIsTracking] = useState(false);
  const [isTracked, setIsTracked] = useState(initialTracked);

  // A card can outlive a refetch that changes is_tracked after mount: login or
  // org switch (-> true), or the bill being removed on the board (-> false).
  // Follow it both ways. This only fires when the prop changes, so a local
  // optimistic track is not walked back before its own invalidation refetches.
  useEffect(() => {
    setIsTracked(initialTracked);
  }, [initialTracked]);

  if (!user) {
    return (
      <Button asChild size="sm" className={cn(COMPACT_ON_MOBILE, className)}>
        <LoginLink aria-label={`Track ${billNumber}`}>
          <UserPlus className={cn('h-4 w-4', iconGap)} aria-hidden="true" />
          <span className="hidden sm:inline">{trackLabel}</span>
        </LoginLink>
      </Button>
    );
  }

  const handleTrack = async () => {
    setIsTracking(true);
    try {
      const result = await data.bills.trackBillById({
        billId,
        tenantId: activeTenant?.tenantId,
      });
      setIsTracked(true);
      // The cached search pages still hold is_tracked:false for this bill, so a
      // "Not tracked" list would keep showing it and a second button (e.g. the
      // dialog's) would still read Track. Invalidate the search cache so every
      // instance re-derives from a fresh is_tracked.
      queryClient.invalidateQueries({ queryKey: ['bills', 'search'] });
      // A tracked bill is excluded from recommendations, so drop it from that row.
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });
      // The board ("Your Bills") reads from BillsProvider, a separate app-level
      // context that this React Query key does not touch — so without this the
      // board stays stale until a full reload. BillsProvider is mounted once at
      // the root layout, so refreshing here refetches the same state the board
      // renders, and the newly tracked bill shows up when the user navigates to
      // it. Fire-and-forget: the search UI already reflects the track locally.
      void refreshBills();
      toast({
        title: result.tracked ? `${billNumber} tracked` : `${billNumber} was already tracked`,
        description: result.tracked
          ? activeTenant
            ? `Added to ${activeTenant.name}'s board.`
            : 'Added to your bills.'
          : undefined,
        // Either way the bill is on the board now — offer to jump to it.
        action: (
          <ToastAction altText={`View ${billNumber} on your board`} onClick={() => viewOnBoard(billId)}>
            View on board
          </ToastAction>
        ),
      });
    } catch (error) {
      toast({
        title: 'Could not track bill',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsTracking(false);
    }
  };

  return (
    /* Matches the board's Track Bill button: default (teal) variant, UserPlus
       icon, same verbiage — so the action looks identical wherever it appears.
       The tracked state drops to `secondary` because it is a completed state,
       not a call to action. */
    <Button
      size="sm"
      variant={isTracked ? 'secondary' : 'default'}
      onClick={handleTrack}
      disabled={isTracking || isTracked}
      aria-label={isTracked ? `${billNumber} is tracked` : `Track ${billNumber}`}
      className={cn(COMPACT_ON_MOBILE, className)}
    >
      {isTracking ? (
        <Loader2 className={cn('h-4 w-4 animate-spin', iconGap)} aria-hidden="true" />
      ) : isTracked ? (
        <Check className={cn('h-4 w-4', iconGap)} aria-hidden="true" />
      ) : (
        <UserPlus className={cn('h-4 w-4', iconGap)} aria-hidden="true" />
      )}
      <span className="hidden sm:inline">{isTracked ? 'Tracked' : trackLabel}</span>
    </Button>
  );
}
