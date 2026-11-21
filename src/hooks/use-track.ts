'use client';

import { useCallback } from 'react';
import { useAuth } from '@/hooks/contexts/auth-context';
import { data } from '@/lib/data-client';
import { getAnonId } from '@/lib/analytics/anon-id';
import type { ClientEventName } from '@/lib/analytics/events';

/**
 * Fire-and-forget usage tracking. `opts.path` overrides the current pathname
 * (used for normalized page-view paths). Never throws, never blocks.
 */
export function useTrack() {
  const { user, activeTenant } = useAuth();
  const userId = user?.id ?? null;
  const tenantId = activeTenant?.tenantId ?? null;

  return useCallback(
    (event: ClientEventName, props?: Record<string, unknown>, opts?: { path?: string }) => {
      try {
        void data.analytics
          .track({
            event,
            props,
            tenantId,
            anonId: userId ? null : getAnonId(),
            path: opts?.path ?? window.location.pathname,
          })
          .catch(() => {});
      } catch {
        // tracking never throws
      }
    },
    [userId, tenantId],
  );
}
