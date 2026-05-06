import { db } from '@/db/kysely/client';
import { isBillDead } from '@/lib/dead-bill';
import type { SessionDeadlines, StatusUpdate } from '@/lib/dead-bill';
import type { BillStatus } from '@/db/types';
import deadlinesJson from '@/data/session-deadlines-2026.json';

const deadlines = deadlinesJson as SessionDeadlines;

async function main() {
  const today = new Date().toISOString().split('T')[0];
  console.log(`Dead-bill sweep — ${today}\n`);

  // Fetch all bills that have the required fields
  const bills = await db
    .selectFrom('bills')
    .select(['id', 'bill_number', 'bill_status', 'committee_assignment', 'dead'])
    .where('bill_number', 'is not', null)
    .where('bill_status', 'is not', null)
    .where('committee_assignment', 'is not', null)
    .orderBy('bill_number')
    .execute();

  console.log(`Found ${bills.length} bills to evaluate.\n`);

  let flaggedDead = 0;
  let flaggedAlive = 0;
  let unchanged = 0;
  let errors = 0;

  for (const bill of bills) {
    try {
      // Fetch status updates for this bill
      const statusUpdates: StatusUpdate[] = await db
        .selectFrom('status_updates')
        .select(['statustext', 'date', 'chamber'])
        .where('bill_id', '=', bill.id)
        .orderBy('date', 'asc')
        .execute();

      const result = isBillDead(
        {
          bill_number: bill.bill_number!,
          bill_status: bill.bill_status as BillStatus,
          committee_assignment: bill.committee_assignment!,
        },
        statusUpdates,
        deadlines,
        today,
      );

      // Only update if the flag changed
      if (result.dead !== bill.dead) {
        await db
          .updateTable('bills')
          .set({ dead: result.dead })
          .where('id', '=', bill.id)
          .execute();

        const action = result.dead ? 'DEAD' : 'ALIVE';
        console.log(`  ${bill.bill_number}: ${action} — ${result.reason}`);

        if (result.dead) flaggedDead++;
        else flaggedAlive++;
      } else {
        unchanged++;
      }
    } catch (err) {
      console.error(`  ${bill.bill_number}: ERROR — ${err}`);
      errors++;
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Newly flagged DEAD:  ${flaggedDead}`);
  console.log(`Newly flagged ALIVE: ${flaggedAlive}`);
  console.log(`Unchanged:           ${unchanged}`);
  console.log(`Errors:              ${errors}`);

  await db.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
