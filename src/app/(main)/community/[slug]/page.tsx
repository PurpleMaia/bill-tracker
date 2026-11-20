import type { Metadata } from 'next';
import { getPublicTenantBySlug } from '@/db/queries/tenants';
import { boardMetadata } from '@/lib/boards/board-metadata';
import { OrgBoardRoute } from '@/components/boards/org-board-route';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return boardMetadata(await getPublicTenantBySlug(slug));
}

export default async function OrgBoardPage({ params }: Props) {
  const { slug } = await params;
  return <OrgBoardRoute slug={slug} />;
}
