/**
 * Seeds a set of DUMMY bills for the 2027 USER-TESTING SIMULATION.
 *
 * These bills exist so external testers (acting as PUBLIC users — no org) can
 * discover them in search, track/untrack them, organize a personal board from
 * empty, and draft/submit testimony. Nothing is pre-tracked: testers start with
 * an empty board on purpose. See
 * docs/superpowers/specs/2026-08-26-sim-2027-user-testing-design.md.
 *
 * All bills use the URL prefix below, which scripts/undo-sim-2027.ts keys on to
 * remove ONLY these rows. Real bills and every other dummy set are never touched.
 * Bill numbers use the reserved HB/SB 98xx range (97xx = jaden-showcase,
 * 99xx = column-stress), and year = 2027 so they appear under the 2027 filter.
 *
 * Testimony deadlines are date-relative in demo mode, so view the app with
 * NEXT_PUBLIC_DEMO_DEADLINES=1 to keep the "Write Testimony" action open.
 *
 * MEANT FOR THE DEV / TEST DATABASE ONLY.
 *
 * Run:  npx tsx scripts/seed-sim-2027.ts
 * Undo: npx tsx scripts/undo-sim-2027.ts
 *
 * Idempotent: bills are keyed by URL; re-running only inserts what's missing.
 */
import { db } from '@/db/kysely/client';
import type { BillStatus } from '@/db/types';

const URL_PREFIX = 'https://dummy.test/sim-2027/';
const YEAR = 2027;

// Hearing datetimes drive a card's testimony countdown. This one is anchored a
// few days ahead so, under the demo calendar, the "Testimony due in Nd" state is
// exercisable for the days following the seed. Text uses the scraped M-D-YY format.
const HEARING_UPCOMING = '02-15-27 9:00AM';

interface SimBill {
  key: string; // stable id for ordering / bill numbering
  chamber: 'HB' | 'SB';
  status: BillStatus;
  committee: string;
  topic: string;
  dead?: boolean;
  /** Latest status_update text — drives card state / testimony countdown. */
  latest: { date: string; text: string };
}

// One dummy per case. Order assigns bill numbers (HB/SB 98xx). A realistic
// spread across the pipeline so testers see varied cards while browsing.
const SIM_BILLS: SimBill[] = [
  {
    key: 'intro-farm-to-school',
    chamber: 'HB',
    status: 'introduced',
    committee: 'AGR, EDN',
    topic: 'FARM TO SCHOOL MEALS',
    latest: { date: '1/20/2027', text: 'Introduced and Pass First Reading.' },
  },
  {
    key: 'hearing-scheduled-vouchers',
    chamber: 'HB',
    status: 'scheduled1',
    committee: 'AGR',
    topic: 'FARMERS MARKET VOUCHERS',
    latest: {
      date: '2/9/2027',
      text: `The committee(s) on AGR has scheduled a public hearing on ${HEARING_UPCOMING} in conference room 325.`,
    },
  },
  {
    key: 'waiting-local-produce',
    chamber: 'SB',
    status: 'waiting2',
    committee: 'AEN, WAM',
    topic: 'LOCAL PRODUCE PROCUREMENT',
    latest: { date: '2/6/2027', text: 'Reported from AEN with recommendation of passage.' },
  },
  {
    key: 'crossover-taro',
    chamber: 'HB',
    status: 'crossoverWaiting1',
    committee: 'AGR',
    topic: 'TARO CULTIVATION',
    latest: { date: '3/8/2027', text: 'Passed Third Reading. Transmitted to Senate.' },
  },
  {
    key: 'crossover-scheduled-breadfruit',
    chamber: 'SB',
    status: 'crossoverScheduled1',
    committee: 'AGR',
    topic: 'BREADFRUIT PRODUCTION',
    latest: {
      date: '3/12/2027',
      text: 'The committee(s) on AGR has scheduled a public hearing on 03-20-27 2:00PM in conference room 224.',
    },
  },
  {
    key: 'conference-school-gardens',
    chamber: 'HB',
    status: 'conferenceAssigned',
    committee: 'FIN',
    topic: 'SCHOOL GARDEN PROGRAMS',
    latest: { date: '4/12/2027', text: 'House conferees appointed. Senate conferees appointed.' },
  },
  {
    key: 'passed-conference-aquaculture',
    chamber: 'SB',
    status: 'conferencePassed',
    committee: 'WAM',
    topic: 'AQUACULTURE PERMITTING',
    latest: { date: '4/28/2027', text: 'Conference committee report adopted. Passed Final Reading.' },
  },
  {
    key: 'to-governor-food-reserves',
    chamber: 'HB',
    status: 'transmittedGovernor',
    committee: 'FIN',
    topic: 'EMERGENCY FOOD RESERVES',
    latest: { date: '5/2/2027', text: 'Transmitted to the Governor.' },
  },
  {
    key: 'signed-double-bucks',
    chamber: 'HB',
    status: 'governorSigns',
    committee: 'FIN',
    topic: 'DOUBLE BUCKS PROGRAMS',
    latest: { date: '6/10/2027', text: 'Act 073, signed by the Governor.' },
  },
  // --- Failure cases so testers see dead-bill states too ---
  {
    key: 'dead-deferred-land-leases',
    chamber: 'HB',
    status: 'scheduled1',
    committee: 'JDC',
    topic: 'AGRICULTURAL LAND LEASES',
    dead: true,
    latest: { date: '2/24/2027', text: 'The committee(s) on JDC deferred the measure.' },
  },
  {
    key: 'dead-not-adopted-irrigation',
    chamber: 'SB',
    status: 'waiting2',
    committee: 'WAM',
    topic: 'IRRIGATION REPAIR GRANTS',
    dead: true,
    latest: {
      date: '2/22/2027',
      text: 'The committee(s) on WAM recommended that the recommendation was not adopted.',
    },
  },
  {
    key: 'dead-missed-deadline-food-hub',
    chamber: 'HB',
    status: 'introduced',
    committee: 'AGR, EDN, FIN', // triple referral → filing deadline already passed
    topic: 'FOOD HUB INFRASTRUCTURE',
    dead: true,
    latest: { date: '1/16/2027', text: 'Introduced and Pass First Reading.' },
  },
];

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

async function main() {
  const existing = await db
    .selectFrom('bills')
    .select(['id', 'bill_url'])
    .where('bill_url', 'like', `${URL_PREFIX}%`)
    .execute();
  const existingUrls = new Set(existing.map((b) => b.bill_url));

  let seeded = 0;

  await db.transaction().execute(async (trx) => {
    for (let i = 0; i < SIM_BILLS.length; i++) {
      const sb = SIM_BILLS[i];
      const num = 9800 + i;
      const billNumber = `${sb.chamber}${num}`;
      const billUrl = `${URL_PREFIX}${billNumber}_${YEAR}`;
      const chamber = sb.chamber === 'HB' ? 'H' : 'S';

      // Idempotent: skip bills that already exist.
      if (existingUrls.has(billUrl)) continue;

      const bill = await trx
        .insertInto('bills')
        .values({
          bill_number: billNumber,
          bill_title: `RELATING TO ${sb.topic}.`,
          nickname: `Sim 2027 — ${titleCase(sb.topic)}`,
          description: `Simulated 2027 bill for user testing (${titleCase(sb.topic)}). Not a real measure.`,
          bill_url: billUrl,
          current_status_string: sb.latest.text,
          introducer: 'KAPELA, AQUINO',
          committee_assignment: sb.committee,
          bill_status: sb.status,
          ai_status: sb.status,
          food_related: true,
          year: YEAR,
          dead: sb.dead ?? false,
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      // An intro row plus the latest (state-driving) row. The latest row must be
      // the newest date so it wins the "latest_update" pick.
      await trx
        .insertInto('status_updates')
        .values([
          { bill_id: bill.id, chamber, date: '1/16/2027', statustext: 'Introduced and Pass First Reading.' },
          { bill_id: bill.id, chamber, date: sb.latest.date, statustext: sb.latest.text },
        ])
        .execute();

      seeded++;
    }
  });

  console.log(`Seeded ${seeded} simulated 2027 bills (prefix ${URL_PREFIX}). None are pre-tracked.`);
  console.log('View with NEXT_PUBLIC_DEMO_DEADLINES=1 so testimony deadlines stay open.');
  console.log('Undo with: npx tsx scripts/undo-sim-2027.ts');

  await db.destroy();
}

main().catch(async (err) => {
  console.error('Seeding failed (transaction rolled back):', err);
  await db.destroy();
  process.exit(1);
});
