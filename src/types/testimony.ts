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
  /** When the user marked this testimony as submitted on the capitol site. */
  submittedAt: string | null;
}

/** Per-bill testimony progress for the current user (board badges). */
export interface TestimonyStatus {
  billId: string;
  submitted: boolean;
}

/**
 * A tracked bill with a hearing scheduled where the user has not started a
 * testimony yet — surfaced in the "Needs testimony" section.
 */
export interface TestimonyProspect {
  billId: string;
  billNumber: string;
  billTitle: string | null;
  nickname: string | null;
  description: string | null;
  billUrl: string;
  year: number | null;
  billStatus: string;
  committeeAssignment: string | null;
  /** Most recent scraped status update, for hearing-datetime parsing. */
  latestStatusText: string | null;
}

/**
 * One row on the Testimonies page: the user's testimony plus enough bill
 * context to render state, deadlines, and links (already unwrapped for the
 * client).
 */
export interface TestimonyListItem {
  billId: string;
  billNumber: string;
  billTitle: string | null;
  nickname: string | null;
  billUrl: string;
  year: number | null;
  billStatus: string;
  committeeAssignment: string | null;
  dead: boolean;
  position: TestimonyPosition;
  authorName: string;
  organization: string;
  /** Plain-text preview of the testimony body ('' when the draft is empty). */
  excerpt: string;
  updatedAt: string | null;
  /** Null while the testimony is still a draft. */
  submittedAt: string | null;
  /** Most recent scraped status update, for hearing-datetime parsing. */
  latestStatusText: string | null;
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
