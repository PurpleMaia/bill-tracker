'use client'
import { useState } from "react"
import { Button } from "../ui/button"
import { ListRestart, RefreshCw, Lock } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Bill } from "@/types/legislation";
import { scrapeForUpdatesAction } from "@/app/actions/scraper";
import { useBills } from "@/hooks/contexts/bills-context";
import { useAuth } from "@/hooks/contexts/auth-context";

interface Props {
    bills: Bill[]
    onRefreshStart?: () => void
    onRefreshEnd?: () => void
}

export default function RefreshColumnButton({ bills, onRefreshStart, onRefreshEnd  } : Props) {
    const [loading, setLoading] = useState<boolean>(false)
    const { updateBill } = useBills()
    const { user } = useAuth() // Add this line to get authentication state

    const handleScrapeBillsStatuses = async () => {
        // Prevent scraping if not authenticated
        if (!user) {
            toast({
                title: "Authentication Required",
                description: "Please log in to refresh bill statuses.",
                variant: 'destructive',
            });
            return;
        }

        for (const bill of bills) {
            toast({
                title: `Checking ${bill.bill_number}`,
                description: `Scraping this bill for status updates...`,
                variant: 'default',
              });
    
            const result = await scrapeForUpdatesAction(bill.id) // result is the full json
    
            if (!result) {
                console.log('Error scraping individual bill')
                toast({
                    title: `Error: ${bill.bill_number}`,
                    description: `Could not scrape individual bill for status updates`,
                    variant: 'destructive',
                });
            } else {
                // Update the bill in the Bills Context
                updateBill(bill.id, { latest_update: result.individualBill.updates[0] ?? null });
                toast({
                    title: `Done: ${bill.bill_number}`,
                    description: `Successfully updated this bill.`,
                    variant: 'default',
                });
            }
        }
    }

    // If not authenticated, show disabled button with lock icon
    if (!user) {
        return (
            <Button
                variant='ghost'
                disabled={true}
                className="opacity-50 cursor-not-allowed"
                title="Login required to refresh statuses"
            >
                <Lock className="h-4 w-4" />
            </Button>
        );
    }

    return (
        <>
            <Button
                onClick={async () => {
                    setLoading(true);
                    onRefreshStart?.()

                    await handleScrapeBillsStatuses();

                    onRefreshEnd?.()
                    setLoading(false)
                }}
                variant='ghost'
                disabled={loading}
              >
                { loading ? (
                    <span className="flex items-center gap-2"><RefreshCw className='animate-spin'/></span>
                ) : (
                    <span className="flex items-center gap-2"><ListRestart className="h-4 w-4"/></span>
                )}
                Refresh Updates
            </Button>
        </>
    )
}