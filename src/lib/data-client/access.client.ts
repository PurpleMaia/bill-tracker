import { defineClient } from './define-client';
import {
  requestAdminAccessAction,
  requestSupervisorAccessAction,
} from '@/app/actions/access';

// ---- fetch arm (hits /api/access/*, created in P6) ----

async function requestAdminFetch(params: { email: string }): Promise<boolean> {
  const res = await fetch('/api/access/request-admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to request admin access');
  }
  const data = await res.json().catch(() => ({}));
  return data.success ?? true;
}

async function requestSupervisorFetch(params: { email: string }): Promise<boolean> {
  const res = await fetch('/api/access/request-supervisor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to request supervisor access');
  }
  const data = await res.json().catch(() => ({}));
  return data.success ?? true;
}

export const accessClient = defineClient('access', {
  requestAdmin: { action: requestAdminAccessAction, fetch: requestAdminFetch },
  requestSupervisor: { action: requestSupervisorAccessAction, fetch: requestSupervisorFetch },
});
