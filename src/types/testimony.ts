import type { TestimonyChamber } from '@/lib/testimony/testimony-round';

/**
 * A testimony position. Mirrors the `testimonies.position` CHECK constraint
 * (`support | oppose | comments`). Defined here — not imported from generated
 * `@/db/types` — because in some environments the column is a text+CHECK
 * column rather than a Postgres enum, so kysely-codegen types it as plain
 * `string` and emits no enum. This is the app's canonical source for the type.
 */
export type TestimonyPosition = 'support' | 'oppose' | 'comments';

/** Which hearing round a testimony is for (null on testimonies written before rounds existed). */
export interface TestimonyRoundFields {
  chamber: TestimonyChamber | null;
  /** Committee step ("AGR", "AGL/WTL"); null for conference or unknown. */
  committee: string | null;
  /** Display label: "House · AGR", "Conference", "Earlier testimony". */
  label: string;
}

/** One of a user's testimonies for a bill — one per hearing round (already unwrapped for the client). */
export interface TestimonyDraft extends TestimonyRoundFields {
  id: string;
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
export interface TestimonyListItem extends TestimonyRoundFields {
  /** The testimony's id — a bill can have several, one per hearing round. */
  id: string;
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
  /**
   * This testimony is for the bill's current hearing round, so the latest
   * hearing notice (countdown, urgency) applies to it. False for earlier rounds.
   */
  isCurrentRound: boolean;
  /** Label of the bill's current hearing round ("Senate · AGL"). */
  currentRoundLabel: string;
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

/** Payload for saving an existing testimony by id (the bill is fixed by the row). */
export type TestimonyUpdateInput = Omit<TestimonyDraftInput, 'billId'>;

/** Payload for starting a testimony for a bill's current hearing round. */
export interface TestimonyCreateInput {
  billId: string;
  tenantId?: string | null;
  /** Copy header + body from this testimony (the caller's own) instead of starting blank. */
  copyFromId?: string | null;
  /** Prefill for the author field when starting blank. */
  authorName?: string;
}

/** A followed bill offered in the "New testimony" picker on Your Testimonies. */
export interface TestimonyBillOption {
  billId: string;
  billNumber: string;
  billTitle: string | null;
  nickname: string | null;
  billStatus: string;
  /** Label of the bill's current hearing round ("Senate · AGL"). */
  roundLabel: string;
  /** A hearing is scheduled and its submission window hasn't closed — testimony can be submitted now. */
  scheduled: boolean;
  /** The user already has a testimony covering the current round (picking it opens that one). */
  written: boolean;
}
