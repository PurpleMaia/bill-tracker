import { db } from '@/db/kysely/client';
import {
  parseCommittees,
  getReferralType,
  getBillChamber,
  isPreCrossover,
  getRelevantDeadline,
  isExplicitlyDeferred,
  isBillDead,
} from '@/lib/dead-bill';
import type { SessionDeadlines } from '@/lib/dead-bill';
import { COLUMN_INDEX } from '@/lib/kanban-columns';
import type { BillStatus } from '@/db/types';
import deadlinesJson from '@/data/session-deadlines-2026.json';

const deadlines = deadlinesJson as SessionDeadlines;

async function main() {
  const billId = process.argv[2];

  if (!billId) {
    console.error('Usage: tsx scripts/check-bill-dead.ts <bill-id>');
    console.error('  bill-id can be a UUID or a bill number like HB1234');
    process.exit(1);
  }

  try {
    // Fetch bill — support both UUID and bill_number lookup
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(billId);

    let billQuery = db
      .selectFrom('bills')
      .select(['id', 'bill_number', 'bill_title', 'bill_status', 'committee_assignment']);

    if (isUUID) {
      billQuery = billQuery.where('id', '=', billId);
    } else {
      billQuery = billQuery.where('bill_number', '=', billId.toUpperCase());
    }

    const bill = await billQuery.executeTakeFirst();

    if (!bill) {
      console.error(`Bill not found: ${billId}`);
      process.exit(1);
    }

    if (!bill.committee_assignment) {
      console.error(`Bill ${bill.bill_number} has no committee_assignment`);
      process.exit(1);
    }

    if (!bill.bill_status) {
      console.error(`Bill ${bill.bill_number} has no bill_status`);
      process.exit(1);
    }

    // Fetch status updates
    const statusUpdates = await db
      .selectFrom('status_updates')
      .select(['statustext', 'date', 'chamber'])
      .where('bill_id', '=', bill.id)
      .orderBy('date', 'asc')
      .execute();

    // Compute derived values for display
    const committees = parseCommittees(bill.committee_assignment);
    const referralType = getReferralType(committees.length);
    const chamber = getBillChamber(bill.bill_number!);
    const preCrossover = isPreCrossover(bill.bill_status as BillStatus);
    const today = new Date().toISOString().split('T')[0];

    const relevantDeadline = getRelevantDeadline(
      referralType,
      chamber,
      preCrossover,
      deadlines,
      today,
      bill.committee_assignment
    );

    const explicitlyDeferred = isExplicitlyDeferred(statusUpdates);

    // Run the verdict
    const result = isBillDead(
      {
        bill_number: bill.bill_number!,
        bill_status: bill.bill_status as BillStatus,
        committee_assignment: bill.committee_assignment,
      },
      statusUpdates,
      deadlines,
      today
    );

    // Print formatted output
    console.log('');
    console.log(`Bill: ${bill.bill_number} — "${bill.bill_title}"`);
    console.log(`Committees: ${bill.committee_assignment}`);
    console.log(`Referral type: ${referralType.charAt(0).toUpperCase() + referralType.slice(1)} (${committees.length} committee${committees.length !== 1 ? 's' : ''})`);
    console.log(`Chamber: ${chamber === 'HB' ? 'House' : 'Senate'} (${chamber})`);
    console.log(`Current status: ${bill.bill_status} (index ${COLUMN_INDEX[bill.bill_status] ?? '?'})`);
    console.log(`Phase: ${preCrossover ? 'Pre-crossover' : 'Post-crossover'}`);
    console.log('');

    if (relevantDeadline) {
      console.log(`Relevant deadline: ${relevantDeadline.name} (${relevantDeadline.date})`);
      console.log(`Minimum required status: ${relevantDeadline.minimumStatus} (index ${COLUMN_INDEX[relevantDeadline.minimumStatus] ?? '?'})`);
    } else {
      console.log('Relevant deadline: None (no deadlines have passed yet)');
    }
    console.log(`Today: ${today}`);
    console.log('');

    console.log(`Kill condition 1 (explicit deferral): ${explicitlyDeferred ? 'YES' : 'NO'}`);
    if (relevantDeadline) {
      const currentIdx = COLUMN_INDEX[bill.bill_status] ?? 0;
      const requiredIdx = COLUMN_INDEX[relevantDeadline.minimumStatus] ?? 0;
      const missed = currentIdx < requiredIdx;
      console.log(`Kill condition 2 (missed deadline): ${missed ? 'YES' : 'NO'}${missed ? ` — bill is at ${bill.bill_status} but should be at ${relevantDeadline.minimumStatus} by ${relevantDeadline.date}` : ''}`);
    } else {
      console.log('Kill condition 2 (missed deadline): N/A (no deadlines passed)');
    }
    console.log('');

    console.log(`VERDICT: ${result.dead ? 'DEAD' : 'ALIVE'}`);
    console.log(`Reason: ${result.reason}`);
    console.log('');
  } finally {
    await db.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
