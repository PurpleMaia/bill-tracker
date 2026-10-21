'use client';

import { useCallback } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { BILL_PARAM, withBillParam } from '@/lib/bills/bill-dialog-url';

/** History-state key marking an entry pushed by `open` (vs. one restored from a link, refresh or Back button). */
const PUSHED_KEY = '__billDialog';

/** The entry a close already sent `history.back()` from; a repeat close before popstate lands is a no-op. */
let closingEntry: unknown = null;

/**
 * The open bill details dialog, kept in the URL as `?bill=<id>` rather than
 * component state, so leaving for the Contact / Testimony pages and coming
 * back (browser back or their Back button) reopens the same bill.
 *
 * Opening pushes a history entry, so the browser/phone back button closes the
 * dialog. Closing pops that entry when `open` pushed it; otherwise (the
 * dialog was restored from a link, refresh or Back button) it removes the
 * param in place. Either way, back after closing never reopens the dialog.
 * The "pushed" marker lives in the history entry itself, so it is shared by
 * every component calling this hook and survives remounts.
 *
 * Uses the native History API rather than router.push/replace: Next keeps
 * useSearchParams in sync with it, and it skips the server round trip a
 * router navigation makes for every query change — so the dialog opens and
 * closes instantly. Reads the live URL (not render-time params) so a close
 * fired late, e.g. after a slow save, acts on where the user is now.
 */
export function useBillDialogParam() {
  const pathname = usePathname();
  const billId = useSearchParams().get(BILL_PARAM);

  const open = useCallback(
    (id: string) => {
      const { search, hash } = window.location;
      window.history.pushState({ [PUSHED_KEY]: true }, '', pathname + withBillParam(search, id) + hash);
    },
    [pathname],
  );

  const close = useCallback(() => {
    const { pathname: livePath, search, hash } = window.location;
    if (livePath !== pathname || !new URLSearchParams(search).has(BILL_PARAM)) return;
    const entry = window.history.state;
    if (entry !== null && entry === closingEntry) return;
    if (entry?.[PUSHED_KEY]) {
      closingEntry = entry;
      window.history.back();
    } else {
      window.history.replaceState(null, '', pathname + withBillParam(search, null) + hash);
    }
  }, [pathname]);

  return { billId, open, close };
}
