'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useBillDialogParam } from '@/hooks/use-bill-dialog-param';
import { BillDetailsDialog, type BillDetailsDialogProps } from './bill-details-dialog';

type UrlBillDetailsDialogProps = Omit<BillDetailsDialogProps, 'billID' | 'isOpen' | 'onClose' | 'returnTo'>;

/**
 * BillDetailsDialog driven by the `?bill=<id>` URL param (see useBillDialogParam).
 * Hosts open a bill with `useBillDialogParam().open(id)` and render this once;
 * the Contact / Testimony links get this page (dialog open) as their return path.
 */
export function UrlBillDetailsDialog(props: UrlBillDetailsDialogProps) {
  const { billId, close } = useBillDialogParam();
  const pathname = usePathname();
  const search = useSearchParams().toString();

  return (
    <BillDetailsDialog
      {...props}
      billID={billId}
      isOpen={billId !== null}
      onClose={close}
      returnTo={pathname + (search ? `?${search}` : '')}
    />
  );
}
