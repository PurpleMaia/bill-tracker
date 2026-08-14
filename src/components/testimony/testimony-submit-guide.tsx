'use client';

import { useState } from 'react';
import type { BillDetails } from '@/types/legislation';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { data } from '@/lib/data-client';
import { invalidateTestimonies } from '@/hooks/use-testimonies';
import { toast } from '@/hooks/use-toast';
import { ArrowLeft, Check, CheckCircle2, ExternalLink, FileText, Loader2, SquareKanban } from 'lucide-react';

interface TestimonySubmitGuideProps {
  bill: BillDetails;
  /** Whether the user already marked this testimony as submitted. */
  submitted: boolean;
  onMarkSubmitted: () => void;
  onBack: () => void;
  /** Where the final "done" button returns to — '/' (board) unless the user came from /testimonies. */
  doneHref?: string;
}

const STEPS: Array<{ title: string; body: string }> = [
  {
    title: 'Login to the Hawaii State Legislature website',
    body: 'Go to capitol.hawaii.gov and click "Log In" (top right). If you don\'t have an account yet, register with your email — it\'s free and takes a minute.',
  },
  {
    title: 'Find this measure',
    body: 'Use the link below to open this bill\'s measure page, or search for the bill number on the site.',
  },
  {
    title: 'Wait for a hearing notice',
    body: 'Testimony can only be submitted once a committee schedules a hearing. When one is scheduled, a "Submit Testimony" option appears for the measure. Check the Status Updates panel here for hearing notices or wait for a notification email.',
  },
  {
    title: 'Submit your testimony', 
    body: 'On their Submit Testimony form, select the measure and hearing, indicate your position (support/oppose/comments) and whether you will testify in person, remotely, or written-only, then upload the PDF or DOCX file you downloaded or paste your text in their text box.',
  },
  {
    title: 'Beat the deadline',
    body: 'Submit at least 24 hours before the hearing start time. Late testimony is still accepted but may not be considered by the committee before the hearing.',
  },
];

export function TestimonySubmitGuide({
  bill,
  submitted,
  onMarkSubmitted,
  onBack,
  doneHref = '/',
}: TestimonySubmitGuideProps) {
  const router = useRouter();
  const [marking, setMarking] = useState(false);
  const fromTestimonies = doneHref === '/testimonies';

  const handleMarkSubmitted = async () => {
    setMarking(true);
    try {
      await data.testimony.markSubmitted(bill.id);
      invalidateTestimonies();
      onMarkSubmitted();
      toast({ title: 'Testimony submitted', description: `Marked your ${bill.bill_number} testimony as submitted.` });
    } catch {
      toast({ title: 'Error', description: 'Could not mark the testimony as submitted.', variant: 'destructive' });
    } finally {
      setMarking(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold">
          How to submit your testimony for {bill.bill_number}
        </h2>
        <ol className="space-y-4">
          {STEPS.map((step, index) => (
            <li key={index} className="flex gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium">
                  {index + 1}. {step.title}
                </p>
                <p className="text-sm text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-5 flex flex-wrap gap-2">
          {bill.bill_url && (
            <Button asChild variant="outline" size="sm">
              <a href={bill.bill_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                Open {bill.bill_number} on capitol.hawaii.gov
              </a>
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <a href="https://www.capitol.hawaii.gov/submittestimony.aspx" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Go to Submit Testimony
            </a>
          </Button>
        </div>

        {/* Done submitting on the capitol site? Record it so the board shows progress. */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 p-3">
          <p className="text-sm text-muted-foreground">
            {submitted
              ? `Your ${bill.bill_number} testimony is marked as submitted.`
              : 'Finished submitting on the capitol website?'}
          </p>
          {submitted ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700">
              <Check className="h-4 w-4" />
              Submitted
            </span>
          ) : (
            <Button size="sm" onClick={handleMarkSubmitted} disabled={marking}>
              {marking ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
              I submitted my testimony
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back: Review
        </Button>
        <Button onClick={() => router.push(doneHref)}>
          {fromTestimonies ? (
            <FileText className="mr-1.5 h-4 w-4" />
          ) : (
            <SquareKanban className="mr-1.5 h-4 w-4" />
          )}
          {fromTestimonies ? 'Back to Testimonies' : 'Back to Kanban Board'}
        </Button>
      </div>
    </div>
  );
}
