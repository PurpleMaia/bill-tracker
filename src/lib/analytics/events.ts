import { z } from 'zod';
import type { NewUsageEvent } from '@/db/queries/usage-events';
import { normalizePath } from '@/lib/analytics/paths';

export const CLIENT_EVENTS = [
  'page_view',
  'bill_opened',
  'bill_search',
  'testimony_exported',
  'csv_exported',
  'tracker_view_changed',
  'tour_finished',
] as const;
export type ClientEventName = (typeof CLIENT_EVENTS)[number];

export const SERVER_EVENTS = ['login', 'signup', 'status_change'] as const;
export type ServerEventName = (typeof SERVER_EVENTS)[number];

export const MAX_PROPS_BYTES = 2048;
export const MAX_QUERY_CHARS = 100;
const HOUR_MS = 60 * 60 * 1000;

export type TrackInput = {
  event: ClientEventName;
  props?: Record<string, unknown>;
  tenantId?: string | null;
  anonId?: string | null;
  path?: string | null;
};

const propsSchema = z
  .record(z.unknown())
  .refine((p) => JSON.stringify(p).length <= MAX_PROPS_BYTES, 'props too large');

const clientEventSchema = z.object({
  event: z.enum(CLIENT_EVENTS),
  props: propsSchema.optional(),
  tenantId: z.string().max(64).nullish(),
  anonId: z.string().max(64).nullish(),
  path: z.string().max(200).nullish(),
});

/** Returns a sanitized TrackInput, or null if the payload is not an allowed client event. */
export function validateClientEvent(input: unknown): TrackInput | null {
  const parsed = clientEventSchema.safeParse(input);
  if (!parsed.success) return null;
  const value: TrackInput = parsed.data;
  if (value.event === 'bill_search' && value.props && typeof value.props.query === 'string') {
    value.props = { ...value.props, query: value.props.query.trim().slice(0, MAX_QUERY_CHARS) };
  }
  return value;
}

/** Keep a requested tenant only if the user is a member. `null` memberTenantIds means signed out. */
export function resolveTenant(
  requested: string | null | undefined,
  memberTenantIds: string[] | null,
): string | null {
  if (!requested || !memberTenantIds) return null;
  return memberTenantIds.includes(requested) ? requested : null;
}

export function toStoredEvent(
  input: TrackInput,
  ctx: { userId: string | null; memberTenantIds: string[] | null; now?: Date },
): NewUsageEvent | null {
  // Searches are stored fully anonymous: no identity, no path, whitelisted props,
  // and a timestamp coarsened to the hour so they can't be correlated to a session.
  if (input.event === 'bill_search') {
    const raw = input.props ?? {};
    const props: Record<string, unknown> = {};
    if (typeof raw.query === 'string') props.query = raw.query;
    if (typeof raw.resultCount === 'number') props.resultCount = raw.resultCount;
    const now = ctx.now ?? new Date();
    const createdAt = new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS);
    return { event: input.event, userId: null, tenantId: null, anonId: null, path: null, props, createdAt };
  }

  const props = input.props ?? {};
  const path = input.path ? normalizePath(input.path) : null;

  if (ctx.userId) {
    return {
      event: input.event,
      userId: ctx.userId,
      tenantId: resolveTenant(input.tenantId, ctx.memberTenantIds),
      anonId: null,
      path,
      props,
    };
  }

  if (!input.anonId) return null;
  return { event: input.event, userId: null, tenantId: null, anonId: input.anonId, path, props };
}
