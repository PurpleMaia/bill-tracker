'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { BILL_PARAM, withBillParam } from '@/lib/bills/bill-dialog-url';

/**
 * The open bill details dialog, kept in the URL as `?bill=<id>` rather than
 * component state, so leaving for the Contact / Testimony pages and coming
 * back (browser back or their Back button) reopens the same bill.
 *
 * Opening pushes a history entry, so the browser/phone back button closes the
 * dialog. Closing pops that entry when this mount pushed it; otherwise (the
 * dialog was restored from history or a refresh) it removes the param in
 * place. Either way, back after closing never reopens the dialog.
 *
 * Uses the native History API rather than router.push/replace: Next keeps
 * useSearchParams in sync with it, and it skips the server round trip a
 * router navigation makes for every query change — so the dialog opens and
 * closes instantly. Reads the live URL (not render-time params) so a close
 * fired late, e.g. after a slow save, acts on where the user is now.
 */
export function useBillDialogParam() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const openBillId = searchParams.get(BILL_PARAM);

  // Whether the current `?bill=` entry was pushed by this mount.
  const openedHereRef = useRef(false);
  // Guards against a second close (e.g. onOpenChange + a button) firing
  // before the first navigation has updated the URL.
  const closingRef = useRef(false);
  useEffect(() => {
    closingRef.current = false;
  }, [openBillId]);

  // The dialog animates out after `isOpen` flips false; keep feeding it the
  // last bill so the exit animation still has content.
  const lastBillIdRef = useRef<string | null>(null);
  if (openBillId) lastBillIdRef.current = openBillId;
  const dialogBillId = openBillId ?? lastBillIdRef.current;

  const openBill = useCallback(
    (billId: string) => {
      openedHereRef.current = true;
      window.history.pushState(null, '', pathname + withBillParam(window.location.search, billId));
    },
    [pathname],
  );

  const closeBill = useCallback(() => {
    const live = window.location;
    if (live.pathname !== pathname || !new URLSearchParams(live.search).has(BILL_PARAM)) return;
    if (closingRef.current) return;
    closingRef.current = true;
    if (openedHereRef.current) {
      openedHereRef.current = false;
      window.history.back();
    } else {
      window.history.replaceState(null, '', pathname + withBillParam(live.search, null));
    }
  }, [pathname]);

  return { openBillId, dialogBillId, isOpen: openBillId !== null, openBill, closeBill };
}
