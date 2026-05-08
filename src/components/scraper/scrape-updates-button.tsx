'use client'
import { useState } from "react"
import { Button } from "../ui/button"
import { ListRestart, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Bill, StatusUpdate } from "@/types/legislation";
import { scrapeForUpdates } from "@/services/scraper";

interface Props {
    bill: Bill
    onRefresh: (
        description: string, 
        committee_assignment: string, 
        introducers: string, 
        updates: StatusUpdate[]) => void
}

// NOTE: This component does not save to the database. It only updates the UI optimistically.
export default function RefreshStatusesButton({ bill, onRefresh } : Props) {
    const [loading, setLoading] = useState<boolean>(false)

    const handleScrapeStatuses = async () => {
        toast({
            title: `Checking ${bill.bill_number}`,
            description: `Scraping this bill for status updates...`,
            variant: 'default',
          });

        const result = await scrapeForUpdates(bill.id) // result is the full json

        if (!result) {
            console.log('Error scraping individual bill')
            toast({
                title: `Error: ${bill.bill_number}`,
                description: `Could not scrape individual bill for status updates`,
                variant: 'destructive',
            });
        } else {
            // Update the Details Dialog with updates
            onRefresh(
                result.individualBill.description,
                result.individualBill.committee_assignment,
                result.individualBill.introducers,
                result.individualBill.updates
            );

            toast({
                title: `Done: ${bill.bill_number}`,
                description: `Successfully updated this bill.`,
                variant: 'default',
              });
            setLoading(false)
        }
    }
    return (
        <>
            <Button
            size="sm" className="px-6 h-9"
                onClick={async () => {
                    setLoading(true);
                    await handleScrapeStatuses();
                }}
                disabled={loading}
              >
                { loading ? (
                    <span className="flex items-center gap-2"><RefreshCw className='animate-spin'/>Loading</span>
                ) : (
                    <span className="flex items-center gap-2"><ListRestart />Refresh</span>
                )}
            </Button>
        </>
    )
}