import { db } from '@/db/kysely/client';
import type { BillStatus } from '@/db/types';

/**
 * Maps deferred statuses to their corresponding scheduled status.
 * A bill that was deferred at a committee hearing was last "scheduled"
 * for that hearing — that's the accurate status to display with the dead flag.
 */
const DEFERRED_TO_SCHEDULED: Record<string, BillStatus> = {
  deferred1: 'scheduled1',
  deferred2: 'scheduled2',
  deferred3: 'scheduled3',
  crossoverDeferred1: 'crossoverScheduled1',
  crossoverDeferred2: 'crossoverScheduled2',
  crossoverDeferred3: 'crossoverScheduled3',
  conferenceDeferred: 'conferenceScheduled',
};

const DEFERRED_STATUSES = Object.keys(DEFERRED_TO_SCHEDULED);

async function main() {
  console.log('Reclassifying deferred bills...\n');

  let totalUpdated = 0;

  for (const deferredStatus of DEFERRED_STATUSES) {
    const scheduledStatus = DEFERRED_TO_SCHEDULED[deferredStatus];

    const result = await db
      .updateTable('bills')
      .set({
        bill_status: scheduledStatus,
        dead: true,
      })
      .where('bill_status', '=', deferredStatus as BillStatus)
      .executeTakeFirst();

    const count = Number(result.numUpdatedRows);
    if (count > 0) {
      console.log(`  ${deferredStatus} → ${scheduledStatus}: ${count} bill(s)`);
      totalUpdated += count;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total reclassified: ${totalUpdated}`);

  await db.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
