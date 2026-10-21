'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
 */
export function useBillDialogParam() {
  const router = useRouter();
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
      router.push(pathname + withBillParam(searchParams.toString(), billId), { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const closeBill = useCallback(() => {
    if (!openBillId || closingRef.current) return;
    closingRef.current = true;
    if (openedHereRef.current) {
      openedHereRef.current = false;
      router.back();
    } else {
      router.replace(pathname + withBillParam(searchParams.toString(), null), { scroll: false });
    }
  }, [openBillId, router, pathname, searchParams]);

  return { openBillId, dialogBillId, isOpen: openBillId !== null, openBill, closeBill };
}
