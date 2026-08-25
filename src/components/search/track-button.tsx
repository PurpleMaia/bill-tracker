'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoginDialog } from '@/components/auth/login-dialog';
import { useAuth } from '@/hooks/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { data } from '@/lib/data-client';

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
}

/**
 * Tracks a bill to the user's active org board. For logged-out visitors the
 * same button opens the login dialog in place, so a visitor never loses their
 * search results to a redirect.
 */
export function TrackButton({ billId, billNumber, initialTracked = false }: TrackButtonProps) {
  const { user, activeTenant } = useAuth();
  const { toast } = useToast();
  const [isTracking, setIsTracking] = useState(false);
  const [isTracked, setIsTracked] = useState(initialTracked);

  // A card can outlive a refetch (login, org switch) that resolves is_tracked to
  // true after mount. Adopt that, but never walk back a local optimistic track.
  useEffect(() => {
    if (initialTracked) setIsTracked(true);
  }, [initialTracked]);

  if (!user) {
    return (
      <LoginDialog
        trigger={
          <Button size="sm" className={COMPACT_ON_MOBILE} aria-label={`Track ${billNumber}`}>
            <UserPlus className="h-4 w-4 sm:mr-1.5" aria-hidden="true" />
            <span className="hidden sm:inline">Track Bill</span>
          </Button>
        }
      />
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
      toast({
        title: result.tracked ? `${billNumber} tracked` : `${billNumber} was already tracked`,
        description: result.tracked
          ? activeTenant
            ? `Added to ${activeTenant.name}'s board.`
            : 'Added to your bills.'
          : undefined,
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
      className={COMPACT_ON_MOBILE}
    >
      {isTracking ? (
        <Loader2 className="h-4 w-4 animate-spin sm:mr-1.5" aria-hidden="true" />
      ) : isTracked ? (
        <Check className="h-4 w-4 sm:mr-1.5" aria-hidden="true" />
      ) : (
        <UserPlus className="h-4 w-4 sm:mr-1.5" aria-hidden="true" />
      )}
      <span className="hidden sm:inline">{isTracked ? 'Tracked' : 'Track Bill'}</span>
    </Button>
  );
}
