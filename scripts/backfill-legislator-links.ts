/**
 * Backfills `bill_introducers` and `bills.current_committee` for existing bills.
 * Idempotent (delete-then-insert per bill). Unresolved introducer tokens are
 * logged, not errors.
 *
 * Run (uses DATABASE_URL via src/db/kysely/client, '@/' alias via tsconfig):
 *   npx tsx scripts/backfill-legislator-links.ts [--year 2026] [--dry-run]
 */
import { db } from '@/db/kysely/client';
import { getLegislatorRefs, writeBillLegislatorLinks } from '@/db/queries/legislator-links';
import { resolveIntroducers } from '@/lib/legislators/introducer-links';
import { currentCommitteeStep } from '@/lib/testimony/committees';
import { currentCommitteeForYear } from '@/lib/bills/current-committee-for-year';
import type { StatusLine } from '@/lib/testimony/committees';

const PAGE_SIZE = 500;

function parseArgs(argv: string[]) {
  const dryRun = argv.includes('--dry-run');
  const i = argv.indexOf('--year');
  const year = i >= 0 ? Number(argv[i + 1]) : null;
  if (i >= 0 && !Number.isInteger(year)) throw new Error('--year needs an integer');
  return { dryRun, year };
}

async function main() {
  const { dryRun, year } = parseArgs(process.argv.slice(2));
  console.log(`Legislator-link backfill${year ? ` (year ${year})` : ''}${dryRun ? ' [DRY RUN]' : ''}\n`);

  const legislators = await getLegislatorRefs();
  console.log(`Loaded ${legislators.length} legislators.\n`);

  let processed = 0;
  let linksWritten = 0;
  let withCommittee = 0;
  const unresolvedLog: string[] = [];
  let lastId: string | null = null;

  for (;;) {
    let q = db
      .selectFrom('bills')
      .select(['id', 'bill_number', 'introducer', 'committee_assignment', 'bill_status', 'dead', 'year'])
      .where('bill_number', 'is not', null)
      .orderBy('id')
      .limit(PAGE_SIZE);
    if (year !== null) q = q.where('year', '=', year);
    if (lastId !== null) q = q.where('id', '>', lastId);
    const bills = await q.execute();
    if (bills.length === 0) break;
    lastId = bills[bills.length - 1].id;

    const updates = await db
      .selectFrom('status_updates')
      .select(['bill_id', 'statustext'])
      .where('bill_id', 'in', bills.map((b) => b.id))
      .orderBy('date', 'asc')
      .execute();
    const byBill = new Map<string, StatusLine[]>();
    for (const u of updates) {
      const list = byBill.get(u.bill_id) ?? [];
      list.push({ statustext: u.statustext });
      byBill.set(u.bill_id, list);
    }

    for (const bill of bills) {
      const { links, unresolved } = resolveIntroducers(bill.introducer, bill.bill_number!, legislators);
      const step = currentCommitteeStep({
        committeeAssignment: bill.committee_assignment,
        updates: byBill.get(bill.id) ?? [],
        billStatus: bill.bill_status,
        dead: bill.dead,
      });
      const currentCommittee = currentCommitteeForYear(bill.year, step);

      if (!dryRun) await writeBillLegislatorLinks(bill.id, links, currentCommittee);

      processed++;
      linksWritten += links.length;
      if (currentCommittee) withCommittee++;
      for (const token of unresolved) unresolvedLog.push(`${bill.bill_number}: ${token}`);
    }
  }

  console.log('=== Summary ===');
  console.log(`Bills processed: ${processed}`);
  console.log(`Links ${dryRun ? 'that would be written' : 'written'}: ${linksWritten}`);
  console.log(`Bills with a current committee: ${withCommittee}`);
  console.log(`Unresolved tokens: ${unresolvedLog.length}`);
  for (const line of unresolvedLog) console.log(`  ${line}`);

  await db.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
