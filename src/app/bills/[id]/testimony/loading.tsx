import { PageLoading } from '@/components/main/page-loading';

// The testimony workspace lives outside the (main) shell, so this fallback
// covers the full viewport during navigation.
export default function Loading() {
  return <PageLoading label="Loading testimony workspace…" className="min-h-dvh" />;
}
