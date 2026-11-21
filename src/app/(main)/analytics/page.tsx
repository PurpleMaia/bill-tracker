import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { auth } from '@/lib/auth/session';
import { isSysadmin } from '@/lib/auth/permissions';
import { AnalyticsDashboard } from '@/components/analytics/analytics-dashboard';

// Sysadmin-only; everyone else gets a 404 so the URL doesn't reveal itself.
// The check runs in generateMetadata too, so a non-sysadmin's response never
// carries the "Analytics" title (auth() is cached per request).
// Reading cookies first makes the route dynamic, so Next's static probe doesn't
// hit auth() (mirrors initial-auth.ts).
export const dynamic = 'force-dynamic';

async function requireSysadminPage(): Promise<void> {
  await cookies();
  const session = await auth();
  if (!isSysadmin(session?.user)) notFound();
}

export async function generateMetadata(): Promise<Metadata> {
  await requireSysadminPage();
  return { title: 'Analytics' };
}

export default async function AnalyticsPage() {
  await requireSysadminPage();

  return (
    // h-full makes this div the page's scroller (main stops overflowing).
    <div className="h-full overflow-y-auto">
      <AnalyticsDashboard />
    </div>
  );
}
