'use client'
import type { Bill, BillStatus, TempBill } from '@/types/legislation';
import { useState } from 'react';
import { Button } from '../ui/button';
import { RefreshCw, WandSparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { classifyStatusWithLLM } from '@/services/llm';
import { useBills } from '@/hooks/contexts/bills-context';
import { KANBAN_COLUMNS } from '@/lib/kanban-columns';
import { useAuth } from '@/hooks/contexts/auth-context';

interface Props {
    bill: Bill
}

export default function AIUpdateSingleButton({ bill } : Props) {
  const [loading, setLoading] = useState<boolean>(false); // State for dialog visibility
  const { toast } = useToast();  
  const { setBills, setTempBills } = useBills()
  const { user } = useAuth();

  const canUseAI = !!user;


  // Helper function to get column index based on status ID
  const getColumnIndex = (statusId: BillStatus): number => {
    const index = KANBAN_COLUMNS.findIndex(col => col.id === statusId);
    return index !== -1 ? index : 0; // Default to 0 if not found
  };

  // Handler to trigger LLM classification for all bills
  const handleAIUpdate = async () => {
    setLoading(true);
    
    try {
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

      console.log("ABOUT TO CLASSIFY BILL:", bill.bill_title, "To: ", bill.current_bill_status);

      const classification = await classifyStatusWithLLM(bill.id); 
      
      console.log("CLASSIFICATION:", classification);

      if (!classification) {
        console.log('Error classifying bill status with LLM...')
        
        // Reset processing state on error
        setBills(prevBills => 
          prevBills.map(b => 
            b.id === bill.id 
              ? { ...b, llm_processing: false }
              : b
          )
        );
        
        toast({
          title: `Error: ${bill.bill_number}`,
          description: `Could not classify bill status. Please check that VLLM or LLM environment variable is set and the API is accessible.`,
          variant: 'destructive',
        });
        return;
      }
      
      if (classification !== bill.current_bill_status) {
        const targetColumnIdx = getColumnIndex(classification);
  
        // Create temp bill for the original position
        const tempBill: TempBill = {
          id: bill.id,
          current_status: bill.current_bill_status,          
          proposed_status: classification,
          target_idx: targetColumnIdx, 
          bill_title: bill.bill_title || null
        };      
  
        // Set temp bill 
        setTempBills(prevBills => [
          ...prevBills.filter(tb => tb.id !== bill.id),
          tempBill
        ]);
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

      toast({
        title: 'Finished AI Categorizing',
        description: 'Please reject or accept the changes',
        variant: 'default'      
      });
    } catch (error) {
      console.error('Error in handleAIUpdate:', error);
      
      // Reset processing state on error
      setBills(prevBills => 
        prevBills.map(b => 
          b.id === bill.id 
            ? { ...b, llm_processing: false }
            : b
        )
      );
      
      toast({
        title: `Error: ${bill.bill_number}`,
        description: error instanceof Error ? error.message : 'Failed to classify bill status. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Don't render button for public users or interns
  if (!canUseAI) {
    return null;
  }

  return (
    <>
      <Button
        size="sm" className="px-6 h-9"
        onClick={async () => {
          setLoading(true);
          await handleAIUpdate();
        }}
        disabled={loading || bill.llm_processing || bill.llm_suggested}
      >
        { loading || bill.llm_processing ? (
          <span className="flex items-center gap-2"><RefreshCw className='animate-spin'/>Loading</span>
        ) : (
          <span className="flex items-center gap-2"><WandSparkles />AI Update</span>
        )}
      </Button>    
    </>
  );
}

