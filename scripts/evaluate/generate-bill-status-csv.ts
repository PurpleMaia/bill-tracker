import { db } from '@/db/kysely/client';
import { KANBAN_COLUMNS } from '@/lib/kanban-columns';
import fs from 'fs';
import path from 'path';

const COLUMN_TITLES: Record<string, string> = KANBAN_COLUMNS.reduce((acc, col) => {
  acc[col.id] = col.title;
  return acc;
}, {} as Record<string, string>);

function escapeCsv(value: string | null | undefined): string {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function main() {
  const rows = await db
    .selectFrom('bills as b')
    .leftJoin(
      db
        .selectFrom('status_updates')
        .select([
          'bill_id',
          'date',
          'chamber',
          'statustext',
        ])
        .distinctOn('bill_id')
        .orderBy('bill_id')
        .orderBy('date', 'desc')
        .as('su'),
      'su.bill_id',
      'b.id',
    )
    .select([
      'b.year',
      'b.bill_number',
      'su.date as latest_update_date',
      'b.bill_status',
      'su.chamber as latest_update_chamber',
      'su.statustext as latest_update_text',
    ])
    .where('b.bill_status', '!=', 'unassigned')
    .orderBy('b.bill_number')
    .execute();

  const header = [
    'year',
    'bill',
    'latest_update_chamber',
    'latest_update_text',
    'gold',
  ].join(',');

  const csvRows = rows.map((row) => {
    const statusId = row.bill_status ?? '';
    const year = row.year ?? '';
    return [
      escapeCsv(year as string),
      escapeCsv(row.bill_number),
      escapeCsv(row.latest_update_chamber),
      escapeCsv(row.latest_update_text),
      escapeCsv(statusId),
    ].join(',');
  });

  const csv = [header, ...csvRows].join('\n');
  const outputPath = path.join(__dirname, 'output.csv');
  fs.writeFileSync(outputPath, csv, 'utf-8');

  console.log(`Wrote ${rows.length} rows to ${outputPath}`);

  await db.destroy();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
