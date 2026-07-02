'use client';

import type { BillDetails } from '@/types/legislation';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CheckCircle2, ExternalLink, SquareKanban } from 'lucide-react';

interface TestimonySubmitGuideProps {
  bill: BillDetails;
  onBack: () => void;
}

const STEPS: Array<{ title: string; body: string }> = [
  {
    title: 'Log in to the Hawaii State Legislature website',
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
    body: 'On their Submit Testimony form, select the measure and hearing, indicate your position (support/oppose/comments) and whether you will testify in person, remotely, or written-only, then upload the PDF or DOCX file you downloaded — or paste your text.',
  },
  {
    title: 'Beat the deadline',
    body: 'Submit at least 24 hours before the hearing start time. Late testimony is still accepted but may not be considered by the committee before the hearing.',
  },
];

export function TestimonySubmitGuide({ bill, onBack }: TestimonySubmitGuideProps) {
  const router = useRouter();

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
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back: Review
        </Button>
        <Button onClick={() => router.push('/')}>
          <SquareKanban className="mr-1.5 h-4 w-4" />
          Back to Kanban Board
        </Button>
      </div>
    </div>
  );
}
