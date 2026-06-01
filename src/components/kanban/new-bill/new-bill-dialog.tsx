import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
  } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, ExternalLink, AlertCircle, CheckCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Bill, BillDetails } from "@/types/legislation";
import { findBill } from "@/services/scraper";
import { toast } from "@/hooks/use-toast";
import { findExistingBillByURL, updateFoodStatusOrCreateBill } from "@/services/data/legislation";
import { useBills } from "@/hooks/contexts/bills-context";
import { useAuth } from "@/hooks/contexts/auth-context";

interface NewBillDialogProps {
    isOpen: boolean;
    onClose: () => void;
  }
export function NewBillDialog({ isOpen, onClose }: NewBillDialogProps) {
    const { addBill, removeBill } = useBills()
    const { activeTenant } = useAuth();
    const [isAlreadyInDB, setIsAlreadyInDB] = useState<boolean>(false)
    const [url, setUrl] = useState<string>('')
    const [error, setError] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [billPreview, setBillPreview] = useState<BillDetails | null>(null)
    const [isUpdating, setIsUpdating] = useState<boolean>(false);
    const [isAdopting, setIsAdopting] = useState<boolean>(false);
    const [foodRelatedSelection, setFoodRelatedSelection] = useState<boolean | null>(null);

    // Reset state when dialog opens/closes
    useEffect(() => {
        if (!isOpen) {
            setUrl('');
            setBillPreview(null);
            setError('');
            setIsAlreadyInDB(false);
            setIsLoading(false);
            setIsUpdating(false);
            setIsAdopting(false);
            setFoodRelatedSelection(null);
        }
    }, [isOpen]);    

    const handleUrlSubmit = async () => {
        if (!url.trim()) {
            setError('Please enter a bill URL')
            return
        }

        if (!url.includes('www.capitol.hawaii.gov')) {
            setError('Please enter a valid bill url (e.g. from capitol.hawaii.gov')
            return
        }

        scrapeForBill(url)
    }

    const scrapeForBill = async (url: string) => {
        setIsLoading(true);
        setError('');
        setBillPreview(null);
        setIsAlreadyInDB(false);

        // check for this url already in db
        const existing = await findExistingBillByURL(url)
        if (existing) {
            console.log('found existing bill: ', existing)
            setIsAlreadyInDB(true)
            setBillPreview(existing)
            setIsLoading(false)
            return
        } else {
            setError('Could not find bill in database, scraping for preview now...')
        }

        const result = await findBill(url) // result is the full json
        setBillPreview(result.individualBill)

        if (!result) {
            console.log('Error scraping url')
            toast({
                title: `Error: `,
                description: `Could not scrape url for bill info`,
                variant: 'destructive',
            });
            setError('Could not scrape url for bill info')
        } else {
            setIsLoading(false)
            setError('')
            return
        }         
    }

    const handleConfirm = async () => {
        setIsUpdating(true)

        const result = await updateFoodStatusOrCreateBill(billPreview, foodRelatedSelection, activeTenant?.tenantId)

        if (foodRelatedSelection === true) {    
            addBill(result); // add to client bill array 
        } else {
            removeBill(result.id); // remove from client bill array
        }

        if (!result) {
            console.log('Error updating bill')
        } else {
            onClose()
            toast({
                title: `Successfully updated bill: `,
                description: `${billPreview?.bill_number} is now set as ${!foodRelatedSelection ? 'not' : ''} food-related`,
            });
            setIsUpdating(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
          <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0"> {/* Larger, full height, flex-col ensures footer is at bottom */}
            {/* Header */}
            <DialogHeader className="p-4 border-b sticky top-0 bg-background z-10">
                <div className="flex justify-between items-start">
                    <div>
                        <DialogTitle className="text-lg font-semibold">Manually Manage Bill Cards</DialogTitle>
                        <DialogDescription className="text-sm text-muted-foreground max-w-md">
                            If our AI scraper did not properly deem a bill as food-related or not, you can manually add or remove bills from the Food+ Tracked Bills here.
                        </DialogDescription>
                    </div>
                     {/* The 'X' close button is part of DialogContent by default */}
                </div>
            </DialogHeader>
        
            {/* Main Content Area (Scrollable) */}
            <div className="flex-1 p-4 overflow-auto">
                {/* URL Input Form */}
                <div className="space-y-4 mb-6">
                    <div className="space-y-2">
                        <Label htmlFor="bill-url">Bill URL</Label>
                        <div className="flex gap-2">
                            <Input
                                id="bill-url"
                                type="url"
                                placeholder="https://www.capitol.hawaii.gov/..."
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
                                disabled={isLoading}
                            />
                            <Button 
                                onClick={handleUrlSubmit}
                                disabled={isLoading || !url.trim()}
                            >
                                {isLoading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    'Find Bill'
                                )}
                            </Button>
                        </div>
                    </div>
                </div>

                {billPreview && (
                    <div className="border rounded-lg p-4 space-y-4">
                        <div className="flex items-start justify-between">
                            <h3 className="text-lg font-semibold">Bill Preview</h3>
                            <a 
                                href={url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-sm"
                            >
                                View Original <ExternalLink className="h-3 w-3" />
                            </a>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label className="text-sm font-medium text-muted-foreground">Bill Number</Label>
                                <p className="font-mono text-sm">{billPreview.bill_number}</p>
                            </div>                            

                            <div>
                                <Label className="text-sm font-medium text-muted-foreground">Title</Label>
                                <p className="text-sm font-medium">{billPreview.bill_title}</p>
                            </div>                
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            
                            <div>
                                <Label className="text-sm font-medium text-muted-foreground">Committee Assignment</Label>
                                <p className="text-sm">{billPreview.committee_assignment}</p>
                            </div>                                                        
                            <div>
                                <Label className="text-sm font-medium text-muted-foreground">Introduced By</Label>
                                <p className="text-sm">{billPreview.introducer}</p>
                            </div>                                                        
                        </div>

                        <div>
                            <Label className="text-sm font-medium text-muted-foreground">Description</Label>
                            <p className="text-sm font-medium">{billPreview.description}</p>
                        </div>                        

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label className="text-sm font-medium text-muted-foreground">Created at</Label>
                                <p className="font-mono text-sm">{billPreview.created_at ? billPreview.created_at.toDateString() : 'N/A'}</p>
                            </div>
                            <div>
                                <Label className="text-sm font-medium text-muted-foreground">Last Updated</Label>
                                <p className="font-mono text-sm">{billPreview.updated_at ? billPreview.updated_at.toDateString() : 'N/A'}</p>
                            </div>                                                        
                        </div>   

                        <Alert className="my-4">
                            <AlertDescription>
                                {isAlreadyInDB ? (
                                    <>

                                        {billPreview?.food_related ? (
                                            <>
                                                <div className="flex items-center gap-2 mb-4">
                                                    <CheckCircle className="h-4 w-4 text-green-600" />
                                                    <p> This bill is currently flagged as food-related and appears in the All Bills View.</p>
                                                </div>
                                                <h2 className="font-semibold">Would you like to unflag this bill to be non-food-related?</h2>
                                                <div className="flex items-center gap-4 my-4">
                                                    <Button variant="destructive" onClick={() => setFoodRelatedSelection(false)}>
                                                        Yes, Remove
                                                    </Button>
                                                    <Button variant="outline" onClick={() => setFoodRelatedSelection(true)}>
                                                        No, Keep Tracking
                                                    </Button>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="flex items-center gap-2 mb-4">
                                                    <AlertCircle className="h-4 w-4 text-yellow-600" />
                                                    <p>This bill is not currently flagged as food-related and does not appear in the All Bills View.</p>
                                                </div>
                                                <h2 className="font-semibold">Set this bill as food-related?</h2>
                                                <div className="flex items-center gap-4 my-4">
                                                    <Button onClick={() => setFoodRelatedSelection(true)} disabled={isAdopting}>
                                                        Yes, Set as Food-related
                                                    </Button>
                                                    <Button variant="outline" onClick={onClose} disabled={isAdopting}>
                                                        No, Don&apos;t Track
                                                    </Button>
                                                </div>
                                            </>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <div className="flex items-center gap-2">
                                            <AlertCircle className="h-4 w-4 text-yellow-600" />
                                            <p className="my-4">
                                                Would you like to add this bill and track it as food-related?
                                            </p>
                                        </div>

                                        <h2 className="font-semibold">Add to Food+ Tracked Bills?</h2>
                                        <div className="flex items-center gap-4 my-4">
                                            <Button onClick={() => setFoodRelatedSelection(true)}>
                                                Yes, Add &amp; Track
                                            </Button>
                                            <Button variant="outline" onClick={() => setFoodRelatedSelection(false)}>
                                                Add Without Tracking
                                            </Button>
                                        </div>
                                    </>
                                )}
                            </AlertDescription>
                        </Alert>                                               
                    </div>

                )}

                {/* Error Message */}
                {error && (
                    <Alert variant="destructive" className="mb-4">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                
            </div>
            {/* Footer (contains the close button) - Removed sticky and bottom-0 */}
            <DialogFooter className="p-4 border-t bg-background z-10 mt-auto sm:justify-between"> {/* mt-auto pushes it down if ScrollArea doesn't fill space */}
              <div className='flex gap-2'>
                {foodRelatedSelection !== null && (
                    <Button
                        onClick={handleConfirm}
                        disabled={isUpdating}
                        size="sm"
                        className="w-full"
                    >
                        {isUpdating ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                Saving...
                            </>
                        ) : (
                            'Confirm Changes'
                        )}
                    </Button>
                )}
              </div>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    );    
}   
