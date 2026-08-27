'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/contexts/auth-context';
import { useTrackedBills } from '@/hooks/use-tracked-bills';
import { ArrowRight, Search, UserPlus } from 'lucide-react';
import { DialogDescription } from '@radix-ui/react-dialog';

interface TrackBillDialogProps {
  /** Optional custom trigger. Defaults to a standard primary "Track Bill" button. */
  children?: React.ReactNode;
}

/**
 * Entry point for tracking a new bill. The primary path is the search page,
 * where a bill can be found and tracked in one click. For users who already
 * have a specific bill's URL in hand, the paste-a-URL flow is kept below as an
 * alternative.
 */
export function TrackBillDialog({ children }: TrackBillDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [billUrl, setBillUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { trackBill } = useTrackedBills();

  // Calls the trackBill service and provides feedback via toasts.
  const handleTrackBill = async () => {
    if (!user) {
      toast({
        title: 'Authentication Error',
        description: 'You must be logged in to track bills.',
        variant: 'destructive',
      });
      return;
    }

    if (!billUrl.trim()) {
      toast({
        title: 'Invalid Input',
        description: 'Please enter a bill URL.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const success = await trackBill(billUrl.trim());

      if (success) {
        toast({
          title: 'Success!',
          description: `Bill has been tracked successfully.`,
        });
        setBillUrl('');
        setIsOpen(false);
      } else {
        toast({
          title: 'Tracking Failed',
          description: 'Bill URL not found or already tracked.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to adopt bill. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) {
      handleTrackBill();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children ?? (
          <Button>
            <UserPlus /> Track Bill
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Track a new bill</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Search the {new Date().getFullYear()} legislative session by bill number, title, or
            keyword, then track any bill with one click.
          </DialogDescription>
        </DialogHeader>

        {/* Primary path: the search page. */}
        <Button asChild className="w-full" onClick={() => setIsOpen(false)}>
          <Link href="/search">
            <Search className="h-4 w-4" />
            Go to Search
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>

        {/* Divider between the two paths. */}
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs uppercase tracking-wide text-muted-foreground">or</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        {/* Alternative: paste a bill URL directly. Only for the current session. */}
        <div className="space-y-2">
          <Label htmlFor="billUrl">Paste a bill URL</Label>
          <Input
            id="billUrl"
            placeholder="Paste the bill URL from the Hawaii Legislature website"
            value={billUrl}
            onChange={(e) => setBillUrl(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
          />
          <p className="text-xs text-muted-foreground">
            Only bills from the {new Date().getFullYear()} legislative session can be tracked.
          </p>
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={handleTrackBill}
              disabled={isLoading || !billUrl.trim()}
            >
              {isLoading ? 'Tracking...' : 'Track Bill'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
