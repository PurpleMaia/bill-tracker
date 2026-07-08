'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/contexts/auth-context';
import { useTrackedBills } from '@/hooks/use-tracked-bills';
import { UserPlus } from 'lucide-react';
import { DialogDescription } from '@radix-ui/react-dialog';

interface TrackBillDialogProps {
  /** Optional custom trigger. Defaults to a standard primary "Track Bill" button. */
  children?: React.ReactNode;
}

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
        title: "Authentication Error",
        description: "You must be logged in to track bills.",
        variant: "destructive",
      });
      return;
    }

    if (!billUrl.trim()) {
      toast({
        title: "Invalid Input",
        description: "Please enter a bill URL.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {

      const success = await trackBill(billUrl.trim());

      if (success) {
        toast({
          title: "Success!",
          description: `Bill has been tracked successfully.`,
        });
        setBillUrl('');
        setIsOpen(false);
      } else {
        toast({
          title: "Tracking Failed",
          description: "Bill URL not found or already tracked.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to adopt bill. Please try again.",
        variant: "destructive",
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
      <DialogContent className="">
        <DialogHeader>
          <DialogTitle>Track a new Bill</DialogTitle>
          <DialogDescription className='text-muted-foreground text-sm'>
            <span className="font-semibold">Note: </span>Only track a new bill from the {new Date().getFullYear()} legislative session
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="billId">Bill URL</Label>
            <Input
              id="billUrl"
              placeholder="Paste the bill URL from the Hawaii Legislature website"
              value={billUrl}
              onChange={(e) => setBillUrl(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isLoading}
            />
          </div>
          <div className="flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
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
