'use client';

import { useState } from 'react';
import { KanbanSquareIcon, Plus, Table, Users2Icon } from 'lucide-react';
import { useKanbanBoard } from '@/hooks/contexts/kanban-board-context';
import { useAuth } from '@/hooks/contexts/auth-context';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useTrackedBills } from '@/hooks/use-tracked-bills';

export function BottomTabBar() {
  const { view, setView } = useKanbanBoard();
  const { user, activeTenant } = useAuth();
  const { toast } = useToast();
  const { trackBill } = useTrackedBills();

  const [trackOpen, setTrackOpen] = useState(false);
  const [billUrl, setBillUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const orgRole = activeTenant?.orgRole;

  const leftTabs = ['kanban', 'spreadsheet'] as const;
  const rightTabs = user && orgRole === 'admin' ? (['admin'] as const) : ([] as const);

  const handleTrackBill = async () => {
    if (!user) return;
    if (!billUrl.trim()) {
      toast({ title: "Error", description: "Please enter a bill URL.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const success = await trackBill(billUrl);
      if (success) {
        toast({ title: "Bill Tracked", description: "Bill has been tracked successfully." });
        setBillUrl('');
        setTrackOpen(false);
      } else {
        toast({ title: "Tracking Failed", description: "Bill URL not found or already tracked.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to adopt bill. Please try again.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t bg-background/95 backdrop-blur py-2">
        {leftTabs.map((tab) => {
          const isActive = view === tab;
          return (
            <button
              key={tab}
              onClick={() => setView(tab)}
              className={cn(
                'flex flex-col items-center gap-1 px-3 py-1 text-xs transition-colors',
                isActive ? 'text-primary font-semibold' : 'text-muted-foreground'
              )}
            >
              {tab === 'kanban' && <KanbanSquareIcon className="h-5 w-5" />}
              {tab === 'spreadsheet' && <Table className="h-5 w-5" />}
              <span>{tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
            </button>
          );
        })}

        {/* Track Bill — center action */}
        {user && (
          <button
            onClick={() => setTrackOpen(true)}
            className="flex flex-col items-center gap-1 px-3 py-1 text-xs text-muted-foreground transition-colors"
          >
            <div className="flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground">
              <Plus className="h-3.5 w-3.5" />
            </div>
            <span>Track</span>
          </button>
        )}

        {rightTabs.map((tab) => {
          const isActive = view === tab;
          return (
            <button
              key={tab}
              onClick={() => setView(tab)}
              className={cn(
                'flex flex-col items-center gap-1 px-3 py-1 text-xs transition-colors',
                isActive ? 'text-primary font-semibold' : 'text-muted-foreground'
              )}
            >
              {tab === 'admin' && <Users2Icon className="h-5 w-5" />}
              <span>{tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
            </button>
          );
        })}
      </nav>

      {/* Track Bill Dialog */}
      <Dialog open={trackOpen} onOpenChange={setTrackOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Track a new Bill</DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              <span className="font-semibold">Note: </span>Only track a new bill from the {new Date().getFullYear()} legislative session
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mobile-billUrl">Bill URL</Label>
              <Input
                id="mobile-billUrl"
                placeholder="Paste the bill URL from the Hawaii Legislature website"
                value={billUrl}
                onChange={(e) => setBillUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !isLoading) handleTrackBill(); }}
                disabled={isLoading}
              />
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setTrackOpen(false)}>Cancel</Button>
              <Button onClick={handleTrackBill} disabled={isLoading}>
                {isLoading ? 'Tracking...' : 'Track Bill'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
