'use client';

import type { BillDetails } from '@/types/legislation';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, FileText } from 'lucide-react';
import { cn } from '@/lib/core/utils';
import { Term } from '@/components/ui/term';
import { resolveCommitteeTerm } from '@/lib/glossary/resolvers';
import { parseCommitteeCodes } from '@/lib/testimony/committees';

interface BillReferencePanelProps {
  bill: BillDetails;
}

/**
 * Read-only bill reference sidebar: number, title, description, introducers,
 * committees, capitol link, and status updates. Used by any full-page bill flow
 * (testimony writer, contact legislator) as the left context panel.
 */
export function BillReferencePanel({ bill }: BillReferencePanelProps) {
  return (
    <ScrollArea className="h-full">
      <div className="space-y-5 p-4">
        <div>
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Bill</h3>
          <p className="text-sm font-semibold">{bill.bill_number}</p>
          <p className="text-sm text-muted-foreground">{bill.bill_title}</p>
        </div>

        <div>
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Description</h3>
          <p className="text-sm leading-relaxed">{bill.description}</p>
        </div>

        <div>
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Introducers</h3>
          <p className="text-sm">{bill.introducer || 'N/A'}</p>
        </div>

        <div>
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Committees</h3>
          <p className="text-sm">
            {/* Previously the raw committee_assignment string, unexpanded. */}
            {bill.committee_assignment
              ? parseCommitteeCodes(bill.committee_assignment).map((code, i) => (
                  <span key={code}>
                    {i > 0 && ', '}
                    <Term variant="chip" billId={bill.id} term={resolveCommitteeTerm(code)}>
                      {code}
                    </Term>
                  </span>
                ))
              : 'Not Assigned'}
          </p>
        </div>

        {bill.bill_url && (
          <a
            href={bill.bill_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View on Hawaii State Legislature
          </a>
        )}

        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Status Updates
            {bill.updates && <span className="ml-1.5 text-muted-foreground/60">({bill.updates.length})</span>}
          </h3>
          {bill.updates && bill.updates.length > 0 ? (
            <div className="space-y-2">
              {bill.updates.map((update, index) => (
                <div
                  key={`${bill.id}-ref-update-${index}-${update.id || index}`}
                  className={cn(
                    'rounded-lg border p-2.5 text-sm',
                    index === 0 ? 'border-primary/20 bg-card shadow-sm' : 'border-border/50 bg-card/50',
                  )}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <Term slug="chamber" variant="chip" billId={bill.id}>
                      <Badge variant={index === 0 ? 'default' : 'outline'} className="h-4 px-1.5 text-[10px]">
                        {update.chamber}
                      </Badge>
                    </Term>
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {new Date(update.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">{update.statustext}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-muted-foreground">
              <FileText className="mx-auto mb-1 h-6 w-6 opacity-30" />
              <p className="text-xs">No status updates</p>
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}
