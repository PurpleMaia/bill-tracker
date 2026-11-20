import type { Metadata } from 'next';

export const PRODUCT_NAME = 'Hawaiʻi Bill Tracker';

/**
 * Title/description for an org's board page, so a shared link previews with
 * the org's name in Slack, email and social posts. `org` is null for a private
 * or unknown board, which gets a generic title — never leak that a private org
 * exists.
 */
export function boardMetadata(org: { name: string; description: string } | null): Metadata {
  if (!org) return { title: `Board not found · ${PRODUCT_NAME}` };
  const title = `${org.name}’s Tracker · ${PRODUCT_NAME}`;
  const description = org.description || `Bills ${org.name} is tracking in the Hawaiʻi legislature.`;
  return { title, description, openGraph: { title, description } };
}
