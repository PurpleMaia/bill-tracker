'use server';

import { requestAdminAccess, requestSupervisorAccess } from '@/db/queries/access';

// ==============================================
// ACCESS REQUESTS — SERVER ACTION ARM
// ==============================================
// Action arm for the self-service "request elevated access" flows. The fetch
// arm lives at /api/access/request-admin and /api/access/request-supervisor.
// Both call the same db/queries/access functions.

/** Flags the given email as requesting admin access. Returns success boolean. */
export async function requestAdminAccessAction(params: { email: string }): Promise<boolean> {
  return requestAdminAccess(params.email);
}

/** Flags the given email as requesting supervisor access. Returns success boolean. */
export async function requestSupervisorAccessAction(params: { email: string }): Promise<boolean> {
  return requestSupervisorAccess(params.email);
}
