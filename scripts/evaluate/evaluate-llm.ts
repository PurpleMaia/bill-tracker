import { db } from '@/db/kysely/client';
import { classifyStatusWithLLM } from '@/services/llm';
import fs from 'fs';
import path from 'path';

function escapeCsv(value: string | null | undefined): string {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const CONCURRENCY = 5;

async function main() {
  const bills = await db
    .selectFrom('bills as b')
    .leftJoin(
      db
        .selectFrom('status_updates')
        .select(['bill_id', 'date', 'chamber', 'statustext'])
        .distinctOn('bill_id')
        .orderBy('bill_id')
        .orderBy('date', 'desc')
        .as('su'),
      'su.bill_id',
      'b.id',
    )
    .select([
      'b.id',
      'b.year',
      'b.bill_number',
      'b.bill_status',
      'su.date as latest_update_date',
      'su.chamber as latest_update_chamber',
      'su.statustext as latest_update_text',
    ])
    .where('b.bill_status', '!=', 'unassigned')
    .orderBy('b.bill_number')
    .execute();

  console.log(`Processing ${bills.length} bills with concurrency=${CONCURRENCY}...\n`);

  const results: {
    year: string;
    bill_number: string;
    latest_update_chamber: string;
    latest_update_text: string;
    gold: string;
    predicted: string;
  }[] = [];

  for (let i = 0; i < bills.length; i += CONCURRENCY) {
    const batch = bills.slice(i, i + CONCURRENCY);
    const predictions = await Promise.all(
      batch.map(async (bill) => {
        try {
          return await classifyStatusWithLLM(bill.id);
        } catch (err: any) {
          console.error(`  Error on ${bill.bill_number}: ${err.message}`);
          return null;
        }
      }),
    );

    for (let j = 0; j < batch.length; j++) {
      const bill = batch[j];
      const predicted = predictions[j] ?? 'ERROR';
      const gold = bill.bill_status ?? '';

      results.push({
        year: String(bill.year ?? ''),
        bill_number: bill.bill_number ?? '',
        latest_update_chamber: bill.latest_update_chamber ?? '',
        latest_update_text: bill.latest_update_text ?? '',
        gold,
        predicted,
      });

      const match = gold === predicted ? '✓' : '✗';
      console.log(
        `  [${i + j + 1}/${bills.length}] ${match} ${bill.bill_number} — gold: ${gold}, predicted: ${predicted}`,
      );
    }
  }

  // Write CSV
  const header = ['year', 'bill', 'latest_update_chamber', 'latest_update_text', 'gold', 'predicted'].join(',');
  const csvRows = results.map((r) =>
    [
      escapeCsv(r.year),
      escapeCsv(r.bill_number),
      escapeCsv(r.latest_update_chamber),
      escapeCsv(r.latest_update_text),
      escapeCsv(r.gold),
      escapeCsv(r.predicted),
    ].join(','),
  );
  const csv = [header, ...csvRows].join('\n');
  const outputPath = path.join(__dirname, 'evaluation-results.csv');
  fs.writeFileSync(outputPath, csv, 'utf-8');

  // Calculate accuracy
  const total = results.length;
  const correct = results.filter((r) => r.gold === r.predicted).length;
  const errors = results.filter((r) => r.predicted === 'ERROR').length;
  const accuracy = total > 0 ? ((correct / total) * 100).toFixed(2) : '0.00';

  console.log('\n========== RESULTS ==========');
  console.log(`Total:    ${total}`);
  console.log(`Correct:  ${correct}`);
  console.log(`Wrong:    ${total - correct - errors}`);
  console.log(`Errors:   ${errors}`);
  console.log(`Accuracy: ${accuracy}%`);
  console.log(`Output:   ${outputPath}`);
  console.log('=============================');

  await db.destroy();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
