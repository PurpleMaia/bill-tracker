import { db } from '@/db/kysely/client';

// Product-usage events behind the analytics dashboard. Like every db/queries
// module these functions do no auth: callers (guarded routes/actions) pass
// identity they have already resolved.

export type NewUsageEvent = {
  event: string;
  userId: string | null;
  tenantId: string | null;
  anonId: string | null;
  path: string | null;
  props: Record<string, unknown>;
};

/** Insert one event row. Throws on DB error. */
export async function insertUsageEvent(row: NewUsageEvent): Promise<void> {
  await db
    .insertInto('usage_events')
    .values({
      event: row.event,
      user_id: row.userId,
      tenant_id: row.tenantId,
      anon_id: row.anonId,
      path: row.path,
      props: JSON.stringify(row.props),
    })
    .execute();
}

/**
 * Server-side logger for events the client can't be trusted to report.
 * Never throws: tracking must not break the action that triggered it.
 */
export async function logEvent(
  event: 'login' | 'signup' | 'status_change',
  userId: string | null,
  opts?: { tenantId?: string | null; props?: Record<string, unknown> },
): Promise<void> {
  try {
    await insertUsageEvent({
      event,
      userId,
      tenantId: opts?.tenantId ?? null,
      anonId: null,
      path: null,
      props: opts?.props ?? {},
    });
  } catch (error) {
    console.error('[usage-events] failed to log event', event, error);
  }
}
