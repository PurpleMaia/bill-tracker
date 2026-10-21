import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LearnWalkthrough } from '@/components/learn/learn-walkthrough';

export const metadata: Metadata = {
  title: 'How a bill becomes law | Hawaiʻi Bill Tracker',
  description:
    'A plain-language walkthrough of how a bill moves through the Hawaiʻi State Legislature, and why most bills never become law.',
};

// useSearchParams needs a Suspense boundary in the App Router — same pattern as
// src/app/register/.
export default function LearnPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-2xl px-4 py-12" />}>
      <LearnWalkthrough />
    </Suspense>
  );
}
