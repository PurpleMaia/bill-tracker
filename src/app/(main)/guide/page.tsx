import type { Metadata } from 'next';
import Link from 'next/link';
import {
  BookOpen,
  BookmarkPlus,
  FileText,
  LayoutGrid,
  Search,
  SquareKanban,
  type LucideIcon,
} from 'lucide-react';
import { ReplayTourButton } from '@/components/tour/replay-tour-button';
import { StepVideo } from '@/components/tour/step-video';

export const metadata: Metadata = {
  title: 'Getting started | Hawaiʻi Bill Tracker',
  description:
    'A quick guide to finding, tracking, and speaking up on Hawaiʻi legislation with the Bill Tracker.',
};

interface Step {
  icon: LucideIcon;
  title: string;
  where: string;
  href: string;
  body: React.ReactNode;
  tips: string[];
  /** Clip name in public/tutorial, when a recording exists for this step. */
  video?: string;
}

const STEPS: Step[] = [
  {
    icon: Search,
    video: 'discover',
    title: 'Find bills',
    where: 'Discover',
    href: '/discover',
    body: (
      <>
        Search by bill number, title, or what a bill says. Not sure where to start? Try a topic
        like &ldquo;school meals&rdquo; or &ldquo;agriculture&rdquo;.
      </>
    ),
    tips: [
      'Use the filters to narrow results: session year, chamber (House or Senate), alive or dead, stage, and whether you already track it.',
      'Click a bill to read its summary, its history, and its versions.',
    ],
  },
  {
    icon: BookmarkPlus,
    title: 'Track the ones you care about',
    where: 'Track button',
    href: '/discover',
    body: (
      <>
        Press <strong>Track</strong> on any bill to add it to your own list. You&rsquo;ll need to be
        logged in to do this.
      </>
    ),
    tips: ['You can stop tracking a bill at any time.'],
  },
  {
    icon: SquareKanban,
    video: 'your-bills',
    title: 'Follow your bills',
    where: 'Your Bills',
    href: '/your-bills',
    body: <>Everything you track lives here. Switch between three views with the tabs at the top.</>,
    tips: [
      'Kanban: one column per stage, so you can see at a glance where each bill stands.',
      'Spreadsheet: the same bills as a table you can sort, filter, and export.',
      'Calendar: the dates that matter. Colored dots mark when a bill was introduced, crossed over, went to conference, reached the Governor, or failed. Tap a day to see its bills.',
      'Search, tags, and years narrow whichever view you are in.',
    ],
  },
  {
    icon: FileText,
    video: 'testimonies',
    title: 'Speak up with testimony',
    where: 'Testimonies',
    href: '/testimonies',
    body: (
      <>
        Testimony is your chance to tell a committee what you think of a bill. The guided editor
        walks you through three steps: <strong>Write</strong>, <strong>Review</strong>, and{' '}
        <strong>Submit</strong>.
      </>
    ),
    tips: [
      'Testimony is generally due 24 hours before the hearing, so check the hearing date first.',
      'Your drafts are saved here, and so are the ones you have submitted.',
    ],
  },
  {
    icon: LayoutGrid,
    video: 'boards',
    title: 'See what other groups are tracking',
    where: 'Active Boards',
    href: '/boards/browse',
    body: (
      <>
        Organizations share the bills they follow. Browse their boards (view only) to discover
        what matters to groups you care about.
      </>
    ),
    tips: [],
  },
];

const TERMS: { term: string; meaning: string }[] = [
  { term: 'Crossover', meaning: 'A bill passed its first chamber and moves to the other one.' },
  { term: 'Conference', meaning: 'House and Senate meet to agree on one final version.' },
  { term: 'Governor', meaning: 'The bill is on the Governor’s desk to sign, veto, or let become law.' },
  { term: 'Dead bill', meaning: 'A bill that missed a deadline or was deferred. It usually can’t move forward this session.' },
];

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Getting started</h1>
        <ReplayTourButton />
      </div>
      <p className="mt-4 text-base leading-relaxed text-muted-foreground">
        Every year the Hawaiʻi Legislature considers thousands of bills. This tool helps you find
        the ones that matter to you, follow them as they move, and have your say. Five steps, about
        two minutes.
      </p>

      <ol className="mt-8 space-y-4">
        {STEPS.map((step, i) => (
          <li key={step.title} className="rounded-lg border bg-card p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                aria-hidden
              >
                <step.icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Step {i + 1} ·{' '}
                  <Link href={step.href} className="underline-offset-2 hover:underline">
                    {step.where}
                  </Link>
                </p>
                <h2 className="mt-0.5 text-lg font-semibold">{step.title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                {step.video && (
                  <StepVideo
                    name={step.video}
                    label={`${step.title} demo`}
                    className="mt-3 max-w-md"
                  />
                )}
                {step.tips.length > 0 && (
                  <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground marker:text-olive-dark">
                    {step.tips.map((tip) => (
                      <li key={tip}>{tip}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <section className="mt-10" aria-labelledby="terms-heading">
        <h2 id="terms-heading" className="text-lg font-semibold">
          Words you&rsquo;ll see
        </h2>
        <dl className="mt-3 divide-y rounded-lg border bg-card text-sm">
          {TERMS.map(({ term, meaning }) => (
            <div key={term} className="grid gap-1 px-4 py-3 sm:grid-cols-[8rem_1fr] sm:gap-4">
              <dt className="font-medium">{term}</dt>
              <dd className="text-muted-foreground">{meaning}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-10 flex flex-col gap-3 rounded-lg bg-secondary p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-start gap-3">
          <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
          <p className="text-sm">
            <span className="font-medium">Want the bigger picture?</span>{' '}
            <span className="text-muted-foreground">
              See how a bill becomes law, and why most never do.
            </span>
          </p>
        </div>
        <Link
          href="/learn"
          className="shrink-0 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          How a bill becomes law →
        </Link>
      </div>
    </div>
  );
}
