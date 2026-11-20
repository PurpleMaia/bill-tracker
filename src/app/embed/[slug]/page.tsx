import type { Metadata } from 'next';
import { getPublicTenantBySlug } from '@/db/queries/tenants';
import { boardMetadata } from '@/lib/boards/board-metadata';
import { EmbedBoardView } from '@/components/boards/embed-board-view';

type Props = { params: Promise<{ slug: string }> };

// Framed on other websites (next.config allows framing for /embed/* only).
// Not indexed: search results should land on the full /community/<slug> page.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { ...boardMetadata(await getPublicTenantBySlug(slug)), robots: { index: false } };
}

export default async function EmbedBoardPage({ params }: Props) {
  const { slug } = await params;
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <EmbedBoardView slug={slug} />
    </div>
  );
}
