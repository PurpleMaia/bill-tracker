'use client'
import type { Bill, BillStatus, TempBill } from '@/types/legislation';
import { useRef, useState } from 'react';
import { Button } from '../ui/button';
import { CircleStop, RefreshCw, WandSparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { classifyStatusWithLLM } from '@/services/llm';
import { useBills } from '@/hooks/contexts/bills-context';
import { KANBAN_COLUMNS } from '@/lib/kanban-columns';
import { useAuth } from '@/hooks/contexts/auth-context';

export default function AIUpdateButton() {
  const [processing, setProcessing] = useState<boolean>(false); // State for dialog visibility
  const [shouldStop, setShouldStop] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { toast } = useToast();  
  const { bills, setBills, setTempBills, acceptAllLLMChanges, rejectAllLLMChanges, resetBills } = useBills()
  const { user } = useAuth();

  const canUseAI = !!user;

  // Helper function to get column index based on status ID
  const getColumnIndex = (statusId: BillStatus): number => {
    const index = KANBAN_COLUMNS.findIndex(col => col.id === statusId);
    return index !== -1 ? index : 0; // Default to 0 if not found
  };

  const processBill = async(bill: Bill, abortSignal?: AbortSignal) => {
    const startTime = Date.now()
    console.log(`[${new Date().toISOString()}] STARTED: ${bill.bill_number}`)

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

      // reset the bill to be not processing
      setBills(prevBills => 
        prevBills.map(b => 
          b.id === bill.id 
            ? { ...b, llm_processing: false }
            : b
        )
      );    
      return null
    }
    console.log("ABOUT TO CLASSIFY BILL:", bill.bill_title, "To: ", bill.current_bill_status);
    const classification = await classifyStatusWithLLM(bill.id); 
    // console.log("CLASSIFICATION:", classification);
    // Check if cancelled after LLM call
    if (abortSignal?.aborted || shouldStop) {
      console.log(`🛑 ${bill.bill_number} cancelled after LLM call - ignoring result`);
      // reset the bill to be not processing
      setBills(prevBills => 
        prevBills.map(b => 
          b.id === bill.id 
            ? { ...b, llm_processing: false }
            : b
        )
      );    
      return null
    }
    
    // await new Promise(res => setTimeout(res, 1000 + Math.random() * 1000)); // Simulate async work
    // const classification = 'deferred1'

    const endTime = Date.now()
    const duration = endTime - startTime
    console.log(`✅ [${new Date().toISOString()}] COMPLETED: ${bill.bill_number} in ${duration}ms`);

    if (!classification) {
      console.log('Error classifying bill status with LLM...')
      toast({
        title: `Error: ${bill.bill_number}`,
        description: `Could not classify bill status with LLM`,
        variant: 'destructive',
      });
    } else {

      if (classification !== bill.current_bill_status) {
        // const currentColumnIdx = getColumnIndex(bill.current_bill_status);
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
        setTempBills(prevBills => [
          ...prevBills.filter(tb => tb.id !== bill.id),
          tempBill
        ]);
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
    }
  }

  // Handler to trigger LLM classification for all bills
  const handleAIUpdateAll = async () => { 
    const MAX_REQUESTS = 3

    abortControllerRef.current = new AbortController()
    setShouldStop(false)

    try {
      // main loop that processes each bill 
      for (let i = 0; i < bills.length; i += MAX_REQUESTS) {

        // Check if should stop
        if (shouldStop || abortControllerRef.current?.signal.aborted) {
          console.log('🛑 Processing stopped by user');
          throw new Error('Batch Cancelled')
          break;
        }

        // batch requests (max 3 bills)
        const batch = bills.slice(i, i + MAX_REQUESTS)

        // Process current batch in parallel
        await Promise.allSettled(
          batch.map(bill => processBill(bill, abortControllerRef.current?.signal))
        );     

        // Check for stopping after each batch
        if (shouldStop || abortControllerRef.current?.signal.aborted) {
          console.log('🛑 Processing stopped after batch completion');
          throw new Error('Batch Cancelled')
          break;
        }
        
        // Small delay between batches (also check for cancellation)
        if (i + MAX_REQUESTS < bills.length) {
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(resolve, 100);
            
            // Listen for abort signal during delay
            if (abortControllerRef.current?.signal) {
              abortControllerRef.current.signal.addEventListener('abort', () => {
                clearTimeout(timeout);
                reject(new Error('Cancelled'));
              });
            }
          });
        }
      }
    } catch (error) {

      if (abortControllerRef.current.signal.aborted || shouldStop) {
        console.log('🛑 Processing cancelled');
        toast({
          title: 'Processing Cancelled',
          description: 'AI categorization was stopped',
          variant: 'default'      
        });

        await resetBills()
        setShouldStop(false)

      } else {
        console.error('💥 Error in AI Update:', error);
        toast({
          title: 'Error in AI Processing',
          description: 'Some bills may not have been processed',
          variant: 'destructive'      
        });
      }

    } finally {

      if (!abortControllerRef.current.signal.aborted) {
        toast({
          title: 'Finished AI Categorizing',
          description: 'Please reject or accept the changes',
          variant: 'default'      
        })
      }

      // reset variables
      abortControllerRef.current = null
      setProcessing(false)
    }
      
  }    

  const handleStop = async () => {
    // Signal all processes to stop
    setShouldStop(true);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    setProcessing(false);
  }

  // Don't render button for public users or interns
  if (!canUseAI) {
    return null;
  }

  return (
    <>
    <div className='flex gap-2'>
      {/* AI UPDATE ALL BUTTON */}
      <Button
        onClick={async () => {
          setProcessing(true);
          await handleAIUpdateAll();
        }}
        disabled={bills.some((bill) => bill.llm_suggested) && bills.length > 0}
      >
        { processing ? (
          <span className="flex items-center gap-2"><RefreshCw className='animate-spin'/>Processing</span>
        ) : (
          <span className="flex items-center gap-2"><WandSparkles />AI Update All</span>
        )}
      </Button>

      {/* ACCEPT OR REJECT ALL BUTTONS */}
      
      { bills.length > 0 && !processing && bills.some(bill => bill.llm_suggested) ? (
        <>      
          <Button onClick={async() => await acceptAllLLMChanges()}>
            Accept All
          </Button>

          <Button className='bg-red-400' onClick={async() => await rejectAllLLMChanges()}>      
            Reject All
          </Button>
        </>
      ) : (
        <></>
      )}

      {/* STOP PROCESSING */}
      { processing ? (
        <Button onClick={handleStop}>
          <span className="flex items-center gap-2"><CircleStop />Stop</span>
        </Button>
      ) : (
        <></>
      )}
    </div>
    </>
  );
}

