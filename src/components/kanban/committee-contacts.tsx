'use client';

import type { BillDetails } from '@/types/legislation';
import { parseCommitteeCodes, committeeFullName } from '@/lib/testimony/committees';

/**
 * Lists the committees a bill is assigned to (code + full name). A plain
 * directory — no email/mailto, no AI-draft this pass. Real committee names come
 * from the committees helper; member-level contacts are a follow-up.
 */
export function CommitteeContacts({ bill }: { bill: BillDetails }) {
  const codes = parseCommitteeCodes(bill.committee_assignment);

  if (codes.length === 0) {
    return <p className="text-xs text-muted-foreground">No committees assigned.</p>;
  }

  return (
    <div className="space-y-2">
      {codes.map((code) => (
        <div key={code} className="rounded-md border p-2.5">
          <div className="text-[12.5px] font-bold">{code}</div>
          <div className="text-[11px] text-muted-foreground">{committeeFullName(code)}</div>
        </div>
      ))}
    </div>
  );
}
