'use client';

import { useState } from 'react';
import { Check, Loader2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoginDialog } from '@/components/auth/login-dialog';
import { useAuth } from '@/hooks/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { data } from '@/lib/data-client';

interface TrackButtonProps {
  billId: string;
  billNumber: string;
}

/**
 * Tracks a bill to the user's active org board. For logged-out visitors the
 * same button opens the login dialog in place, so a visitor never loses their
 * search results to a redirect.
 */
export function TrackButton({ billId, billNumber }: TrackButtonProps) {
  const { user, activeTenant } = useAuth();
  const { toast } = useToast();
  const [isTracking, setIsTracking] = useState(false);
  const [isTracked, setIsTracked] = useState(false);

  if (!user) {
    return (
      <LoginDialog
        trigger={
          <Button size="sm" className="min-h-[44px] md:min-h-0">
            <UserPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Track Bill
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
      className="min-h-[44px] md:min-h-0"
    >
      {isTracking ? (
        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
      ) : isTracked ? (
        <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />
      ) : (
        <UserPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
      )}
      {isTracked ? 'Tracked' : 'Track Bill'}
    </Button>
  );
}
