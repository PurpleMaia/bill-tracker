'use client'
import type { Bill, BillStatus, TempBill } from '@/types/legislation';
import { useRef, useState } from 'react';
import { Button } from '../ui/button';
import { RefreshCw, WandSparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { classifyStatusWithLLM } from '@/services/llm';
import { useBills } from '@/hooks/contexts/bills-context';
import { KANBAN_COLUMNS } from '@/lib/kanban-columns';
import { useAuth } from '@/hooks/contexts/auth-context';

interface Props {
  bills: Bill[]
  onRefreshStart?: () => void
  onRefreshEnd?: () => void
}

export default function LLMUpdateColumnButton({ bills, onRefreshStart, onRefreshEnd }: Props) {
  const [loading, setLoading] = useState<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [shouldStop, setShouldStop] = useState(false);
  const { toast } = useToast();
  const { setBills, setTempBills } = useBills();
  const { user } = useAuth();

  const canUseAI = !!user;

  // Helper function to get column index based on status ID
  const getColumnIndex = (statusId: BillStatus): number => {
    const index = KANBAN_COLUMNS.findIndex(col => col.id === statusId);
    return index !== -1 ? index : 0; // Default to 0 if not found
  };

  const processBill = async (bill: Bill, abortSignal?: AbortSignal) => {
    const startTime = Date.now();
    console.log(`[${new Date().toISOString()}] STARTED: ${bill.bill_number}`);

    // Check if cancelled before LLM Call
    if (abortSignal?.aborted) {
      throw new Error('Cancelled');
    }

    // Mark bill as processing
    setBills(prevBills =>
      prevBills.map(b =>
        b.id === bill.id
          ? { ...b, llm_processing: true }
          : b
      )
    );

    toast({
      title: `Classifying ${bill.bill_number}`,
      description: `AI is categorizing this bill...`,
      variant: 'default',
    });

    // Check if cancelled after marking processing
    if (abortSignal?.aborted || shouldStop) {
      console.log(`🛑 ${bill.bill_number} cancelled before processing`);
      setBills(prevBills =>
        prevBills.map(b =>
          b.id === bill.id
            ? { ...b, llm_processing: false }
            : b
        )
      );
      return null;
    }

    console.log("ABOUT TO CLASSIFY BILL:", bill.bill_title, "To: ", bill.current_bill_status);
    
    let classification: string | null | undefined;
    try {
      classification = await classifyStatusWithLLM(bill.id);
    } catch (error) {
      console.error(`Error classifying ${bill.bill_number} with LLM:`, error);
      setBills(prevBills =>
        prevBills.map(b =>
          b.id === bill.id
            ? { ...b, llm_processing: false }
            : b
        )
      );
      toast({
        title: `Error: ${bill.bill_number}`,
        description: `Could not classify bill status with LLM: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive',
      });
      return null;
    }

    // Check if cancelled after LLM call
    if (abortSignal?.aborted || shouldStop) {
      console.log(`🛑 ${bill.bill_number} cancelled after LLM call - ignoring result`);
      setBills(prevBills =>
        prevBills.map(b =>
          b.id === bill.id
            ? { ...b, llm_processing: false }
            : b
        )
      );
      return null;
    }

    const endTime = Date.now();
    const duration = endTime - startTime;
    console.log(`✅ [${new Date().toISOString()}] COMPLETED: ${bill.bill_number} in ${duration}ms`);

    if (!classification) {
      console.log('Error classifying bill status with LLM...');
      setBills(prevBills =>
        prevBills.map(b =>
          b.id === bill.id
            ? { ...b, llm_processing: false }
            : b
        )
      );
      toast({
        title: `Error: ${bill.bill_number}`,
        description: `Could not classify bill status with LLM`,
        variant: 'destructive',
      });
      return null;
    }

    if (classification !== bill.current_bill_status) {
      const targetColumnIdx = getColumnIndex(classification);

      // Create temp bill for the original position
      const tempBill: TempBill = {
        id: bill.id,
        bill_number: bill.bill_number,
        current_status: bill.current_bill_status,
        proposed_status: classification,
        target_idx: targetColumnIdx,
        bill_title: bill.bill_title,
        source: 'llm'
      };

      if (abortSignal?.aborted) {
        throw new Error('Cancelled');
      }

      // Set temp bill
      console.log('🔄 [LLM Column Button] Creating temp bill:', {
        id: tempBill.id,
        bill_number: tempBill.bill_number,
        current_status: tempBill.current_status,
        proposed_status: tempBill.proposed_status,
        target_idx: tempBill.target_idx
      });
      setTempBills(prevBills => {
        const filtered = prevBills.filter(tb => tb.id !== bill.id);
        const updated = [...filtered, tempBill];
        console.log('🔄 [LLM Column Button] Temp bills after update:', updated.length);
        return updated;
      });
    }

    if (abortSignal?.aborted) {
      throw new Error('Cancelled');
    }

    // Update the UI with LLM suggestion (optimistic)
    setBills(prevBills =>
      prevBills.map(b =>
        b.id === bill.id
          ? {
            ...b,
            previous_status: b.current_bill_status, // Store original status
            current_bill_status: classification,
            llm_suggested: true,
            llm_processing: false
          }
          : b
      )
    );

    toast({
      title: `Done: ${bill.bill_number}`,
      description: `AI finished categorizing this bill.`,
      variant: 'default',
    });
  };

  const handleLLMUpdate = async () => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to use AI updates.",
        variant: 'destructive',
      });
      return;
    }

    abortControllerRef.current = new AbortController();
    setShouldStop(false);
    setLoading(true);
    onRefreshStart?.();

    try {
      const MAX_REQUESTS = 3;

      // Process bills in batches
      for (let i = 0; i < bills.length; i += MAX_REQUESTS) {
        // Check if should stop
        if (shouldStop || abortControllerRef.current?.signal.aborted) {
          console.log('🛑 Processing stopped by user');
          throw new Error('Batch Cancelled');
        }

        // batch requests (max 3 bills)
        const batch = bills.slice(i, i + MAX_REQUESTS);

        // Process current batch in parallel
        await Promise.allSettled(
          batch.map(bill => processBill(bill, abortControllerRef.current?.signal))
        );

        // Check for stopping after each batch
        if (shouldStop || abortControllerRef.current?.signal.aborted) {
          console.log('🛑 Processing stopped after batch completion');
          throw new Error('Batch Cancelled');
        }

        // Small delay between batches
        if (i + MAX_REQUESTS < bills.length) {
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(resolve, 100);
            if (abortControllerRef.current?.signal) {
              abortControllerRef.current.signal.addEventListener('abort', () => {
                clearTimeout(timeout);
                reject(new Error('Cancelled'));
              });
            }
          });
        }
      }

      toast({
        title: 'Finished AI Categorizing Column',
        description: 'Please reject or accept the changes',
        variant: 'default'
      });

    } catch (error) {
      if (abortControllerRef.current?.signal.aborted || shouldStop) {
        console.log('🛑 Processing cancelled');
        toast({
          title: 'Processing Cancelled',
          description: 'AI categorization was stopped',
          variant: 'default'
        });
      } else {
        console.error('💥 Error in AI Update:', error);
        toast({
          title: 'Error in AI Processing',
          description: 'Some bills may not have been processed',
          variant: 'destructive'
        });
      }
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
      onRefreshEnd?.();
    }
  };

  // Don't render button for public users or interns
  if (!canUseAI) {
    return null;
  }

  return (
    <>
      <Button
        onClick={handleLLMUpdate}
        variant='ghost'
        disabled={loading}
        title="AI Update Column"
      >
        {loading ? (
          <span className="flex items-center gap-2"><RefreshCw className='animate-spin h-4 w-4' /></span>
        ) : (
          <span className="flex items-center gap-2"><WandSparkles className="h-4 w-4" /></span>
        )}
        Move Bills with AI
      </Button>
    </>
  );
}

