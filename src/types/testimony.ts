import type { TestimonyPosition } from '@/db/types';

export type { TestimonyPosition };

/** A user's saved testimony draft for one bill (already unwrapped for the client). */
export interface TestimonyDraft {
  billId: string;
  authorName: string;
  organization: string;
  position: TestimonyPosition;
  /** Tiptap document JSON ({ type: 'doc', content: [...] }). */
  contentJson: unknown;
  updatedAt: string | null;
}

/** Payload for saving a draft. */
export interface TestimonyDraftInput {
  billId: string;
  /** Active tenant to stamp on the row; null/undefined for public users. */
  tenantId?: string | null;
  authorName: string;
  organization: string;
  position: TestimonyPosition;
  contentJson: unknown;
}
