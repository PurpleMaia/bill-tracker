
import React from 'react';
import type { TempBill } from '@/types/legislation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ArrowRight } from 'lucide-react';
import { Badge } from '../ui/badge';
import { useBills } from '@/hooks/contexts/bills-context';
import { useAuth } from '@/hooks/contexts/auth-context';

interface TempBillCardProps {
    tempBill: TempBill;
    onTempCardClick?: (tempBill: TempBill) => void;
    className?: string;
    canModerate?: boolean;
    onApproveTemp?: (billId: string) => void;
    onRejectTemp?: (billId: string) => void;
    onUndoProposal?: (billId: string) => void;
  }

export const TempBillCard: React.FC<TempBillCardProps> = ({
    tempBill,
    onTempCardClick,
    className,
    canModerate = false,
    onApproveTemp,
    onRejectTemp,
    onUndoProposal
  }) => {
    const { bills } = useBills();
    const { user } = useAuth();
    
    // Get the actual bill data for display (for description and other fields)
    const actualBill = bills.find(b => b.id === tempBill.id);
    
    // Use TempBill's own fields first, fallback to actualBill if available
    const billNumber = tempBill.bill_number || actualBill?.bill_number || tempBill.id || 'Unknown Bill';
    const billTitle = tempBill.bill_title || actualBill?.bill_title || '';
    const description = actualBill?.description || '';

    // Debug logging
    console.log('TempBillCard rendering:', {
      tempBillId: tempBill.id,
      billNumber,
      billTitle,
      tempBillBillNumber: tempBill.bill_number,
      tempBillBillTitle: tempBill.bill_title,
      actualBillFound: !!actualBill,
      currentStatus: tempBill.current_status,
      proposedStatus: tempBill.proposed_status
    });

    const proposerName =
      tempBill.proposed_by?.username ??
      tempBill.proposed_by?.email ??
      tempBill.proposed_by?.user_id ??
      'AI';

    const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
        e.stopPropagation();
        onTempCardClick?.(tempBill);
    }
  
    return (
        <>        
            {/* Add click handler to the content div */}
            <div 
                className="flex flex-col p-3 w-full min-h-[80px] cursor-pointer "
                onClick={handleCardClick}                
                role="button"
                tabIndex={0}
            > 
                <Card className={cn(
                    "relative transition-all duration-300",
                    "border-2 border-dashed border-gray-300 bg-gray-50/80",
                    "hover:border-blue-300 hover:bg-blue-50/50",
                    "opacity-75 w-full",
                    className
                )}>

                    <CardHeader className="p-3 pb-2">
                    <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-col gap-1 flex-1 min-w-0">
                            <CardTitle className="text-sm font-bold text-gray-900" title={billTitle || billNumber}>
                                {billNumber}
                            </CardTitle>
                            {billTitle ? (
                                <p className="text-xs text-gray-600 line-clamp-1 break-words">
                                    {billTitle}
                                </p>
                            ) : (
                                <p className="text-xs text-gray-400 italic">
                                    No title available
                                </p>
                            )}
                        </div>
                        <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200 shrink-0">
                        Moved
                        </Badge>
                    </div>
                    </CardHeader>
                    
                    <CardContent className="p-3 pt-0">
                    {description && (
                        <p className="text-xs text-gray-500 mb-3 line-clamp-2 text-wrap">
                            {description}
                        </p>
                    )}
                    
                    {/* Status change indicator */}
                    <div className="flex items-center gap-2 mb-3 text-xs">
                        <Badge variant="outline" className="text-xs bg-gray-100">
                        {tempBill.current_status}
                        </Badge>
                        <ArrowRight className="h-3 w-3 text-gray-400" />
                        <Badge variant="outline" className="text-xs bg-blue-100 text-blue-700">
                        {tempBill.proposed_status}
                        </Badge>
                    </div>

                    <div className="text-xs text-gray-500">
                      Requested by {proposerName}
                    </div>

                    </CardContent>

                    {/* Undo button for proposal author */}
                    {!canModerate && user && tempBill.proposed_by?.user_id === user.id && (
                        <div className="p-3 pt-2 flex gap-2 mt-2 border-t border-gray-200">
                            <button
                                className="px-3 py-1.5 text-xs rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors flex-1"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onUndoProposal?.(tempBill.id);
                                }}
                            >
                                Undo
                            </button>
                        </div>
                    )}

                    {/* Approve/Reject buttons */}
                    {canModerate && (
                        <div className="p-3 pt-2 flex gap-2 mt-2 border-t border-gray-200">
                            <button
                                className="px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex-1"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onApproveTemp?.(tempBill.id);
                                }}
                            >
                                Approve
                            </button>
                            <button
                                className="px-3 py-1.5 text-xs rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors flex-1"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onRejectTemp?.(tempBill.id);
                                }}
                            >
                                Reject
                            </button>
                        </div>
                    )}
                </Card>
            </div>
        </>
    );
  };