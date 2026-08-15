import type { Metadata } from 'next';
import { BillSearchView } from '@/components/search/bill-search-view';

export const metadata: Metadata = {
  title: 'Search Bills',
  description: 'Search every bill in the Hawaii legislature by number, title, or text.',
};

export default function SearchPage() {
  return <BillSearchView />;
}
