import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BillSearchView } from '@/components/search/bill-search-view';

export const metadata: Metadata = {
  title: 'Hawaiʻi Bill Tracker',
  description: 'Track every bill in the Hawaii legislature.',
};

export default function DiscoverPage() {
  // BillSearchView reads useSearchParams to seed its filters from the URL (a
  // board column's "+" links here with ?stages=…). useSearchParams needs a
  // Suspense boundary above it, mirroring the register page's pattern.
  return (
    <Suspense fallback={null}>
      <BillSearchView />
    </Suspense>
  );
}
