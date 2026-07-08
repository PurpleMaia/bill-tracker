/**
 * Seeds dummy bills into a single kanban status column and tracks them for a
 * target user, to preview how a long list of cards renders in one column.
 *
 * Follows the pattern of the existing dummy bills (HB9901–SB9904): fake
 * `https://dummy.test/...` bill_url, tenant-less user_bills row, and a couple
 * of status_updates rows so card sorting-by-latest-update is exercised.
 *
 * All bills seeded here use the URL prefix below, which is what
 * scripts/undo-seed-dummy-column-bills.ts keys on to remove ONLY these rows
 * (the pre-existing HB9901–SB9904 dummies are untouched).
 *
 * Run:  npx tsx scripts/seed-dummy-column-bills.ts
 * Undo: npx tsx scripts/undo-seed-dummy-column-bills.ts
 */
import { db } from '@/db/kysely/client';
import type { BillStatus } from '@/db/types';

const URL_PREFIX = 'https://dummy.test/column-stress/';
const TARGET_USERNAME = 'j_user';
const TARGET_STATUS: BillStatus = 'introduced';

const TOPICS = [
  'FOOD SECURITY PLANNING',
  'LOCAL PRODUCE PROCUREMENT',
  'AQUACULTURE PERMITTING',
  'FARMERS MARKET VOUCHERS',
  'AGRICULTURAL WATER RATES',
  'SCHOOL GARDEN PROGRAMS',
  'FOOD HUB INFRASTRUCTURE',
  'TARO CULTIVATION',
  'LIVESTOCK FEED SUBSIDIES',
  'COMMUNITY KITCHENS',
  'FOOD WASTE DIVERSION',
  'AGRICULTURAL LAND LEASES',
  'SNAP BENEFIT MATCHING',
  'BREADFRUIT PRODUCTION',
  'POLLINATOR PROTECTION',
  'COLD STORAGE FACILITIES',
  'FARM APPRENTICESHIPS',
  'INVASIVE SPECIES CONTROL',
  'SEED BANKING',
  'RANCHING INFRASTRUCTURE',
  'KUPUNA MEAL PROGRAMS',
  'FOOD LABELING STANDARDS',
  'IRRIGATION REPAIR GRANTS',
  'YOUTH AGRICULTURE EDUCATION',
  'POULTRY PROCESSING',
  'COMPOSTING INCENTIVES',
  'FISHPOND RESTORATION',
  'GROCERY ACCESS ZONES',
  'CROP INSURANCE SUPPORT',
  'HYDROPONIC FACILITIES',
  'FOOD SAFETY CERTIFICATION',
  'AGRITOURISM PERMITS',
  'SOIL HEALTH PROGRAMS',
  'EMERGENCY FOOD RESERVES',
  'COFFEE LABELING',
  'MACADAMIA PEST CONTROL',
  'DAIRY REVITALIZATION',
  'MOBILE SLAUGHTER UNITS',
  'CULINARY WORKFORCE DEVELOPMENT',
  'DOUBLE BUCKS PROGRAMS',
] as const;

const INTRODUCERS = ['KAPELA, AQUINO', 'GABBARD, DELA CRUZ', 'TARNAS, KAHALOA', 'RICHARDS, DECOITE'];
const COMMITTEES = ['AGR, FIN', 'AEN, WAM', 'AGR, EDN, FIN', 'WLA, JDC'];

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

async function main() {
  const user = await db
    .selectFrom('user')
    .select(['id', 'username'])
    .where('username', '=', TARGET_USERNAME)
    .executeTakeFirst();

  if (!user) {
    console.error(`User "${TARGET_USERNAME}" not found — nothing seeded.`);
    process.exit(1);
  }

  const existing = await db
    .selectFrom('bills')
    .select(['bill_url'])
    .where('bill_url', 'like', `${URL_PREFIX}%`)
    .execute();
  const existingUrls = new Set(existing.map((b) => b.bill_url));

  let seeded = 0;

  await db.transaction().execute(async (trx) => {
    for (let i = 0; i < TOPICS.length; i++) {
      const topic = TOPICS[i];
      const type = i % 2 === 0 ? 'HB' : 'SB';
      const num = 9910 + i;
      const billNumber = `${type}${num}`;
      const billUrl = `${URL_PREFIX}${billNumber}_2026`;

      if (existingUrls.has(billUrl)) continue;

      // Stagger the introduction dates so the column's latest-update sorting
      // is visible in the UI.
      const introDay = 15 + (i % 14); // 1/15/2026 .. 1/28/2026
      const chamber = type === 'HB' ? 'H' : 'S';

      const bill = await trx
        .insertInto('bills')
        .values({
          bill_number: billNumber,
          bill_title: `RELATING TO ${topic}.`,
          nickname: `Dummy — ${titleCase(topic)}`,
          description: `Dummy bill seeded to stress-test a long kanban column (${titleCase(topic)}). Not a real measure.`,
          bill_url: billUrl,
          current_status_string: `(${chamber}) 1/${introDay}/2026- Introduced and Pass First Reading.`,
          introducer: INTRODUCERS[i % INTRODUCERS.length],
          committee_assignment: COMMITTEES[i % COMMITTEES.length],
          bill_status: TARGET_STATUS,
          ai_status: TARGET_STATUS,
          food_related: true,
          year: 2026,
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      await trx
        .insertInto('status_updates')
        .values([
          {
            bill_id: bill.id,
            chamber,
            date: `1/${introDay - 1}/2026`,
            statustext: 'Pending introduction.',
          },
          {
            bill_id: bill.id,
            chamber,
            date: `1/${introDay}/2026`,
            statustext: 'Introduced and Pass First Reading.',
          },
        ])
        .execute();

      await trx
        .insertInto('user_bills')
        .values({
          user_id: user.id,
          bill_id: bill.id,
          tenant_id: null,
        })
        .execute();

      seeded++;
    }
  });

  const skipped = TOPICS.length - seeded;
  console.log(`Seeded ${seeded} dummy bills into "${TARGET_STATUS}" tracked by ${user.username}.`);
  if (skipped > 0) console.log(`Skipped ${skipped} already-seeded bills.`);
  console.log(`Undo with: npx tsx scripts/undo-seed-dummy-column-bills.ts`);

  await db.destroy();
}

main().catch(async (err) => {
  console.error('Seeding failed (transaction rolled back):', err);
  await db.destroy();
  process.exit(1);
});
