import { PageLoading } from '@/components/main/page-loading';

// Instant Suspense fallback for navigations within the main app shell —
// the header persists while the destination renders.
export default function Loading() {
  return <PageLoading />;
}
