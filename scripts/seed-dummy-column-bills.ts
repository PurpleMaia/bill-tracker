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
 * Run:  npx tsx scripts/seed-dummy-column-bills.ts [username]   (default: j_user)
 * Undo: npx tsx scripts/undo-seed-dummy-column-bills.ts
 *
 * Idempotent per user: bills are created once (keyed by URL); running again
 * for another username adds tracking rows for that user (org-scoped when the
 * user has a tenant membership, incl. org_bills rows).
 *
 * Committee mixes are chosen so that, with NEXT_PUBLIC_DEMO_DEADLINES=1,
 * introduced bills spread across the deadline countdown tiers:
 *   HB triple (AGR, EDN, FIN) → Triple Referral Filing 7/10 → urgent (red)
 *   SB double (AEN, WAM)      → First Lateral 7/17        → warning (ochre)
 *   HB single (AGR)           → First Decking 8/7         → safe (neutral)
 *   SB single (JDC)           → SB Filing 7/21            → warning (ochre)
 */
import { db } from '@/db/kysely/client';
import type { BillStatus } from '@/db/types';

const URL_PREFIX = 'https://dummy.test/column-stress/';
const TARGET_USERNAME = process.argv[2] ?? 'j_user';
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
// Rotation is index-locked to chamber (even i = HB, odd i = SB) to hit the
// countdown tiers documented in the header comment.
const COMMITTEES = ['AGR, EDN, FIN', 'AEN, WAM', 'AGR', 'JDC'];

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

  // Org members track bills tenant-scoped (user_bills.tenant_id + org_bills).
  const membership = await db
    .selectFrom('members')
    .select(['tenant_id'])
    .where('user_id', '=', user.id)
    .executeTakeFirst();
  const tenantId = membership?.tenant_id ?? null;

  const existing = await db
    .selectFrom('bills')
    .select(['id', 'bill_url'])
    .where('bill_url', 'like', `${URL_PREFIX}%`)
    .execute();
  const existingByUrl = new Map(existing.map((b) => [b.bill_url, b.id]));

  let seeded = 0;
  let tracked = 0;

  await db.transaction().execute(async (trx) => {
    for (let i = 0; i < TOPICS.length; i++) {
      const topic = TOPICS[i];
      const type = i % 2 === 0 ? 'HB' : 'SB';
      const num = 9910 + i;
      const billNumber = `${type}${num}`;
      const billUrl = `${URL_PREFIX}${billNumber}_2026`;

      // Bill already seeded (e.g. by a run for another user): just make sure
      // the target user tracks it.
      const existingId = existingByUrl.get(billUrl);
      if (existingId) {
        tracked += await ensureTracked(trx, existingId, user.id, tenantId);
        continue;
      }

      // Stagger the introduction dates so the column's latest-update sorting
      // is visible in the UI.
      const introDay = 15 + (i % 14); // 1/15/2026 .. 1/28/2026
      const chamber = type === 'HB' ? 'H' : 'S';

      // Mark ~1 in 4 bills dead so dead-state UI (grayed cards, Dead badge,
      // dead/alive filters) renders alongside living bills. Offsets 3 and 6
      // hit both odd and even indexes, so HBs and SBs both die.
      const isDead = i % 8 === 3 || i % 8 === 6;

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
          dead: isDead,
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

      tracked += await ensureTracked(trx, bill.id, user.id, tenantId);

      seeded++;
    }
  });

  console.log(
    `Seeded ${seeded} new dummy bills into "${TARGET_STATUS}"; ${tracked} now tracked by ${user.username}` +
    (tenantId ? ` (org-scoped, tenant ${tenantId.slice(0, 8)}…).` : ' (no tenant).')
  );
  console.log(`Undo with: npx tsx scripts/undo-seed-dummy-column-bills.ts`);

  await db.destroy();
}

type Trx = Parameters<Parameters<ReturnType<typeof db.transaction>['execute']>[0]>[0];

/** Ensure a user_bills row (and org_bills row when tenant-scoped). Returns 1 if newly tracked. */
async function ensureTracked(trx: Trx, billId: string, userId: string, tenantId: string | null): Promise<number> {
  if (tenantId) {
    await trx
      .insertInto('org_bills')
      .values({ bill_id: billId, tenant_id: tenantId, bill_status: TARGET_STATUS })
      .onConflict((oc) => oc.columns(['bill_id', 'tenant_id']).doNothing())
      .execute();
  }

  const alreadyTracked = await trx
    .selectFrom('user_bills')
    .select('id')
    .where('user_id', '=', userId)
    .where('bill_id', '=', billId)
    .$if(tenantId !== null, (qb) => qb.where('tenant_id', '=', tenantId))
    .$if(tenantId === null, (qb) => qb.where('tenant_id', 'is', null))
    .executeTakeFirst();

  if (alreadyTracked) return 0;

  await trx
    .insertInto('user_bills')
    .values({ user_id: userId, bill_id: billId, tenant_id: tenantId })
    .execute();
  return 1;
}

main().catch(async (err) => {
  console.error('Seeding failed (transaction rolled back):', err);
  await db.destroy();
  process.exit(1);
});
