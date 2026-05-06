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
import type { SessionDeadlines, StatusUpdate } from '@/lib/dead-bill';
import { COLUMN_INDEX } from '@/lib/kanban-columns';
import type { BillStatus } from '@/db/types';
import deadlinesJson from '@/data/session-deadlines-2026.json';
import fs from 'fs';

const deadlines = deadlinesJson as SessionDeadlines;

const DEFERRED_STATUSES = new Set([
  'deferred1', 'deferred2', 'deferred3',
  'crossoverDeferred1', 'crossoverDeferred2', 'crossoverDeferred3',
  'conferenceDeferred',
]);

function escapeCsv(value: string | null | undefined): string {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function main() {
  const today = new Date().toISOString().split('T')[0];

  // Fetch all food-related bills
  const bills = await db
    .selectFrom('bills')
    .select([
      'id', 'bill_number', 'bill_title', 'bill_status',
      'committee_assignment', 'year',
    ])
    .where('food_related', '=', true)
    .where('archived', '=', false)
    .orderBy('bill_number')
    .execute();

  console.log(`Found ${bills.length} food-related bills. Processing...\n`);

  const csvHeader = [
    'bill_number', 'year', 'bill_status', 'latest_status_update',
    'committee_assignment', 'referral_type', 'algorithm_verdict',
    'reason', 'gold_truth_dead', 'test_result',
  ].join(',');

  const csvRows: string[] = [csvHeader];

  let totalProcessed = 0;
  let totalPass = 0;
  let totalFail = 0;
  let totalSkipped = 0;

  // Confusion matrix counters
  let truePositive = 0;   // algorithm says DEAD, gold truth says DEAD
  let trueNegative = 0;   // algorithm says ALIVE, gold truth says ALIVE
  let falsePositive = 0;  // algorithm says DEAD, gold truth says ALIVE
  let falseNegative = 0;  // algorithm says ALIVE, gold truth says DEAD

  for (const bill of bills) {
    // Skip bills without required data
    if (!bill.committee_assignment || !bill.bill_status || !bill.bill_number) {
      totalSkipped++;
      csvRows.push([
        escapeCsv(bill.bill_number),
        escapeCsv(String(bill.year ?? '')),
        escapeCsv(bill.bill_status),
        '',
        escapeCsv(bill.committee_assignment),
        '',
        'SKIPPED',
        'Missing committee_assignment or bill_status or bill_number',
        '',
        'SKIP',
      ].join(','));
      continue;
    }

    // Fetch latest status update
    const latestUpdate = await db
      .selectFrom('status_updates')
      .select(['statustext', 'date', 'chamber'])
      .where('bill_id', '=', bill.id)
      .orderBy('date', 'desc')
      .limit(1)
      .executeTakeFirst();

    // Fetch all status updates for deferral check
    const allUpdates: StatusUpdate[] = await db
      .selectFrom('status_updates')
      .select(['statustext', 'date', 'chamber'])
      .where('bill_id', '=', bill.id)
      .orderBy('date', 'asc')
      .execute();

    // Run the algorithm
    const result = isBillDead(
      {
        bill_number: bill.bill_number,
        bill_status: bill.bill_status as BillStatus,
        committee_assignment: bill.committee_assignment,
      },
      allUpdates,
      deadlines,
      today,
    );

    // Derive values for CSV
    const committees = parseCommittees(bill.committee_assignment);
    const referralType = getReferralType(committees.length);
    const algorithmVerdict = result.dead ? 'DEAD' : 'ALIVE';

    // Gold truth: bill_status contains "deferred" = dead
    const goldTruthDead = DEFERRED_STATUSES.has(bill.bill_status);

    // Test: pass if algorithm agrees with gold truth
    let testResult: string;
    if (algorithmVerdict === 'DEAD' && goldTruthDead) {
      testResult = 'PASS (TP)';
      truePositive++;
      totalPass++;
    } else if (algorithmVerdict === 'ALIVE' && !goldTruthDead) {
      testResult = 'PASS (TN)';
      trueNegative++;
      totalPass++;
    } else if (algorithmVerdict === 'DEAD' && !goldTruthDead) {
      testResult = 'FAIL (FP)';
      falsePositive++;
      totalFail++;
    } else {
      // ALIVE but goldTruth is dead
      testResult = 'FAIL (FN)';
      falseNegative++;
      totalFail++;
    }

    totalProcessed++;

    csvRows.push([
      escapeCsv(bill.bill_number),
      escapeCsv(String(bill.year ?? '')),
      escapeCsv(bill.bill_status),
      escapeCsv(latestUpdate?.statustext ?? ''),
      escapeCsv(bill.committee_assignment),
      escapeCsv(referralType),
      escapeCsv(algorithmVerdict),
      escapeCsv(result.reason),
      escapeCsv(goldTruthDead ? 'DEAD' : 'ALIVE'),
      escapeCsv(testResult),
    ].join(','));
  }

  // Write CSV
  const outputPath = 'dead-bill-evaluation.csv';
  fs.writeFileSync(outputPath, csvRows.join('\n') + '\n');

  // Print summary
  const total = totalProcessed;
  const accuracy = total > 0 ? ((totalPass / total) * 100).toFixed(1) : 'N/A';
  const precision = (truePositive + falsePositive) > 0
    ? ((truePositive / (truePositive + falsePositive)) * 100).toFixed(1) : 'N/A';
  const recall = (truePositive + falseNegative) > 0
    ? ((truePositive / (truePositive + falseNegative)) * 100).toFixed(1) : 'N/A';

  console.log('=== Dead Bill Detection Evaluation ===\n');
  console.log(`Total food-related bills: ${bills.length}`);
  console.log(`Processed: ${totalProcessed}`);
  console.log(`Skipped (missing data): ${totalSkipped}`);
  console.log('');
  console.log(`PASS: ${totalPass}  |  FAIL: ${totalFail}`);
  console.log(`Accuracy: ${accuracy}%`);
  console.log('');
  console.log('Confusion Matrix:');
  console.log(`  True Positives  (algo=DEAD, truth=DEAD):   ${truePositive}`);
  console.log(`  True Negatives  (algo=ALIVE, truth=ALIVE): ${trueNegative}`);
  console.log(`  False Positives (algo=DEAD, truth=ALIVE):  ${falsePositive}`);
  console.log(`  False Negatives (algo=ALIVE, truth=DEAD):  ${falseNegative}`);
  console.log('');
  console.log(`Precision: ${precision}%`);
  console.log(`Recall:    ${recall}%`);
  console.log('');
  console.log(`CSV written to: ${outputPath}`);

  await db.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
