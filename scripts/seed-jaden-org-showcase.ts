/**
 * Seeds a curated set of DUMMY bills into the "Jaden Kapali" organization board
 * so every meaningful board state is demonstrable in a walkthrough:
 *
 *   - a bill whose testimony is nearly due and still writable (live countdown)
 *   - a bill whose testimony deadline has already closed (hearing passed)
 *   - bills that failed in different columns for their respective reasons
 *     (deferred by committee / recommendation not adopted / missed deadline)
 *   - one card in every simplified-view column
 *
 * All bills use the URL prefix below, which scripts/undo-jaden-org-showcase.ts
 * keys on to remove ONLY these rows. Real bills, the existing ~62 Jaden-org
 * bills, and the other dummy sets (HB99xx column-stress, HB9901–SB9904) are
 * never touched.
 *
 * Tracked under `jkapali` (the Jaden Kapali org admin). Deadline/testimony dates
 * are tuned to the DEMO calendar — view the board with NEXT_PUBLIC_DEMO_DEADLINES=1
 * so the countdown/urgency states render (see src/lib/testimony/session-deadlines.ts).
 *
 * Run:  npx tsx scripts/seed-jaden-org-showcase.ts
 * Undo: npx tsx scripts/undo-jaden-org-showcase.ts
 *
 * Idempotent: bills are keyed by URL; re-running only ensures the tracking rows.
 */
import { db } from '@/db/kysely/client';
import type { BillStatus } from '@/db/types';

const URL_PREFIX = 'https://dummy.test/jaden-showcase/';
const TENANT_SLUG = 'jaden-kapali';
const ADMIN_USERNAME = 'jkapali';

// A hearing notice dated "yesterday-ish" so it is the newest status_update and
// therefore drives the card's testimony state. Dates use M/D/YYYY text to match
// the scraped format (status_updates.date is text, sorted via cast(date as date)).
//
// Hearing datetimes are anchored a few days off 2026-07-30 (today). The card's
// countdown is computed against the real clock at view time, so these read
// correctly for the days immediately following the seed.
const HEARING_NEARLY_DUE = '08-03-26 9:00AM'; // ~ a few days out → "Testimony due in Nd", still writable
const HEARING_CLOSED = '07-29-26 10:00AM'; // already passed → submission window closed

interface Showcase {
  key: string; // stable id for bill numbering
  chamber: 'HB' | 'SB';
  status: BillStatus;
  committee: string;
  topic: string;
  dead?: boolean;
  /** Latest status_update text — drives testimony countdown / dead reason. */
  latest: { date: string; text: string };
}

// One dummy per showcase case. The order also assigns bill numbers (HB/SB 97xx).
const SHOWCASE: Showcase[] = [
  // --- Testimony cases ---
  {
    key: 'testimony-nearly-due',
    chamber: 'HB',
    status: 'scheduled1',
    committee: 'AGR',
    topic: 'FARMERS MARKET VOUCHERS',
    latest: {
      date: '7/29/2026',
      text: `The committee(s) on AGR has scheduled a public hearing on ${HEARING_NEARLY_DUE} in conference room 325.`,
    },
  },
  {
    key: 'testimony-closed',
    chamber: 'SB',
    status: 'scheduled3',
    committee: 'WTL',
    topic: 'FISHPOND RESTORATION',
    latest: {
      date: '7/28/2026',
      text: `The committee(s) on WTL has scheduled a public hearing on ${HEARING_CLOSED} in conference room 229.`,
    },
  },
  // --- Failure cases ---
  {
    key: 'failed-deferred',
    chamber: 'HB',
    status: 'scheduled1',
    committee: 'JDC',
    topic: 'AGRICULTURAL LAND LEASES',
    dead: true,
    latest: { date: '7/24/2026', text: 'The committee(s) on JDC deferred the measure.' },
  },
  {
    key: 'failed-not-adopted',
    chamber: 'SB',
    status: 'waiting2',
    committee: 'WAM',
    topic: 'IRRIGATION REPAIR GRANTS',
    dead: true,
    latest: {
      date: '7/22/2026',
      text: 'The committee(s) on WAM recommended that the recommendation was not adopted.',
    },
  },
  {
    key: 'failed-missed-deadline',
    chamber: 'HB',
    status: 'introduced',
    committee: 'AGR, EDN, FIN', // triple referral → filing deadline 7/10 already passed
    topic: 'FOOD HUB INFRASTRUCTURE',
    dead: true,
    latest: { date: '1/16/2026', text: 'Introduced and Pass First Reading.' },
  },
  // --- One card in every remaining simplified-view column ---
  {
    key: 'col-introduced-waiting',
    chamber: 'SB',
    status: 'waiting2',
    committee: 'AEN, WAM',
    topic: 'LOCAL PRODUCE PROCUREMENT',
    latest: { date: '7/20/2026', text: 'Reported from AEN with recommendation of passage.' },
  },
  {
    key: 'col-crossover-waiting',
    chamber: 'HB',
    status: 'crossoverWaiting1',
    committee: 'AGR',
    topic: 'TARO CULTIVATION',
    latest: { date: '7/26/2026', text: 'Passed Third Reading. Transmitted to Senate.' },
  },
  {
    key: 'col-crossover-scheduled',
    chamber: 'SB',
    status: 'crossoverScheduled1',
    committee: 'AGR',
    topic: 'BREADFRUIT PRODUCTION',
    latest: {
      date: '7/27/2026',
      text: 'The committee(s) on AGR has scheduled a public hearing on 08-10-26 2:00PM in conference room 224.',
    },
  },
  {
    key: 'col-conference',
    chamber: 'HB',
    status: 'passedCommittees',
    committee: 'FIN',
    topic: 'SCHOOL GARDEN PROGRAMS',
    latest: { date: '7/25/2026', text: 'Passed Third Reading in the Senate with amendments. House disagrees.' },
  },
  {
    key: 'col-awaiting-committees',
    chamber: 'SB',
    status: 'conferenceAssigned',
    committee: 'WAM',
    topic: 'COLD STORAGE FACILITIES',
    latest: { date: '7/26/2026', text: 'House conferees appointed. Senate conferees appointed.' },
  },
  {
    key: 'col-conference-scheduled',
    chamber: 'HB',
    status: 'conferenceScheduled',
    committee: 'FIN',
    topic: 'FOOD SECURITY PLANNING',
    latest: {
      date: '7/27/2026',
      text: 'Bill scheduled for Conference Committee Meeting on 08-05-26 9:30AM in conference room 309.',
    },
  },
  {
    key: 'col-passed-conference',
    chamber: 'SB',
    status: 'conferencePassed',
    committee: 'WAM',
    topic: 'AQUACULTURE PERMITTING',
    latest: { date: '7/28/2026', text: 'Conference committee report adopted. Passed Final Reading.' },
  },
  {
    key: 'col-transmitted-governor',
    chamber: 'HB',
    status: 'transmittedGovernor',
    committee: 'FIN',
    topic: 'EMERGENCY FOOD RESERVES',
    latest: { date: '7/29/2026', text: 'Transmitted to the Governor.' },
  },
  {
    key: 'col-vetoed',
    chamber: 'SB',
    status: 'vetoList',
    committee: 'WAM',
    topic: 'FOOD WASTE DIVERSION',
    latest: { date: '7/29/2026', text: 'Placed on the Governor’s intent-to-veto list.' },
  },
  {
    key: 'col-signed',
    chamber: 'HB',
    status: 'governorSigns',
    committee: 'FIN',
    topic: 'DOUBLE BUCKS PROGRAMS',
    latest: { date: '7/29/2026', text: 'Act 042, signed by the Governor.' },
  },
  {
    key: 'col-law-without-signature',
    chamber: 'SB',
    status: 'lawWithoutSignature',
    committee: 'WAM',
    topic: 'SNAP BENEFIT MATCHING',
    latest: { date: '7/29/2026', text: 'Became law without the Governor’s signature.' },
  },
];

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

async function main() {
  const user = await db
    .selectFrom('user')
    .select(['id', 'username'])
    .where('username', '=', ADMIN_USERNAME)
    .executeTakeFirst();
  if (!user) {
    console.error(`User "${ADMIN_USERNAME}" not found — nothing seeded.`);
    process.exit(1);
  }

  const tenant = await db
    .selectFrom('tenants')
    .select(['id', 'name'])
    .where('slug', '=', TENANT_SLUG)
    .executeTakeFirst();
  if (!tenant) {
    console.error(`Tenant "${TENANT_SLUG}" not found — nothing seeded.`);
    process.exit(1);
  }
  const tenantId = tenant.id;

  const existing = await db
    .selectFrom('bills')
    .select(['id', 'bill_url'])
    .where('bill_url', 'like', `${URL_PREFIX}%`)
    .execute();
  const existingByUrl = new Map(existing.map((b) => [b.bill_url, b.id]));

  let seeded = 0;
  let tracked = 0;

  await db.transaction().execute(async (trx) => {
    for (let i = 0; i < SHOWCASE.length; i++) {
      const sc = SHOWCASE[i];
      const num = 9700 + i;
      const billNumber = `${sc.chamber}${num}`;
      const billUrl = `${URL_PREFIX}${billNumber}_2026`;
      const chamber = sc.chamber === 'HB' ? 'H' : 'S';

      // Already seeded (idempotent): just ensure tracking rows.
      const existingId = existingByUrl.get(billUrl);
      if (existingId) {
        tracked += await ensureTracked(trx, existingId, user.id, tenantId, sc.status);
        continue;
      }

      const bill = await trx
        .insertInto('bills')
        .values({
          bill_number: billNumber,
          bill_title: `RELATING TO ${sc.topic}.`,
          nickname: `Showcase — ${titleCase(sc.topic)}`,
          description: `Dummy showcase bill for the Jaden Kapali board (${titleCase(sc.topic)}). Not a real measure.`,
          bill_url: billUrl,
          current_status_string: sc.latest.text,
          introducer: 'KAPELA, AQUINO',
          committee_assignment: sc.committee,
          bill_status: sc.status,
          ai_status: sc.status,
          food_related: true,
          year: 2026,
          dead: sc.dead ?? false,
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      // An intro row plus the latest (state-driving) row. The latest row must be
      // the newest date so it wins the "latest_update" pick.
      await trx
        .insertInto('status_updates')
        .values([
          { bill_id: bill.id, chamber, date: '1/16/2026', statustext: 'Introduced and Pass First Reading.' },
          { bill_id: bill.id, chamber, date: sc.latest.date, statustext: sc.latest.text },
        ])
        .execute();

      tracked += await ensureTracked(trx, bill.id, user.id, tenantId, sc.status);
      seeded++;
    }
  });

  console.log(
    `Seeded ${seeded} showcase dummy bills into "${tenant.name}"; ${tracked} now tracked by ${user.username}.`,
  );
  console.log('View with NEXT_PUBLIC_DEMO_DEADLINES=1 for the deadline/testimony states.');
  console.log('Undo with: npx tsx scripts/undo-jaden-org-showcase.ts');

  await db.destroy();
}

type Trx = Parameters<Parameters<ReturnType<typeof db.transaction>['execute']>[0]>[0];

/** Ensure a user_bills row and an org_bills row (org status = target column). Returns 1 if newly tracked. */
async function ensureTracked(
  trx: Trx,
  billId: string,
  userId: string,
  tenantId: string,
  status: BillStatus,
): Promise<number> {
  await trx
    .insertInto('org_bills')
    .values({ bill_id: billId, tenant_id: tenantId, bill_status: status })
    .onConflict((oc) => oc.columns(['bill_id', 'tenant_id']).doNothing())
    .execute();

  const alreadyTracked = await trx
    .selectFrom('user_bills')
    .select('id')
    .where('user_id', '=', userId)
    .where('bill_id', '=', billId)
    .where('tenant_id', '=', tenantId)
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
