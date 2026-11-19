import type { Metadata } from 'next';
import { getPublicTenantBySlug } from '@/db/queries/tenants';
import { OrgBoardRoute } from '@/components/boards/org-board-route';

type Props = { params: Promise<{ slug: string }> };

// Server-rendered title/description so a shared link previews with the org's
// name in Slack, email and social posts. Private or unknown boards get a
// generic title — never leak that a private org exists.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const org = await getPublicTenantBySlug(slug);
  if (!org) return { title: 'Board not found · Food+' };
  const description =
    org.description || `Bills ${org.name} is tracking in the Hawaiʻi legislature.`;
  return {
    title: `${org.name} · Food+ board`,
    description,
    openGraph: { title: `${org.name} · Food+ board`, description },
  };
}

export default async function OrgBoardPage({ params }: Props) {
  const { slug } = await params;
  return <OrgBoardRoute slug={slug} />;
}
