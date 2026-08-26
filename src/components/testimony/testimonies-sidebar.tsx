'use client';

import { CalendarDays, CheckCircle2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SessionDeadlines } from '@/lib/bills/dead-bill';
import { SESSION_DEADLINES } from '@/lib/testimony/session-deadlines';

// Official video by the Hawai'i State Senate: "Participate in the
// Legislative Process" — https://www.youtube.com/watch?v=88kLYLFaCOU
const VIDEO_ID = '88kLYLFaCOU';
const VIDEO_TITLE = 'Participate in the Legislative Process';

const GUIDE_STEPS: Array<{ title: string; body: string }> = [
  {
    title: 'Login at capitol.hawaii.gov',
    body: 'Registering is free and takes a minute — testimony is submitted through their site.',
  },
  {
    title: 'Wait for a hearing notice',
    body: 'Testimony opens once a committee schedules a hearing. Bills with hearings appear under "Needs testimony" here.',
  },
  {
    title: 'Draft it here, submit it there',
    body: 'Write and refine your testimony in Food+, then paste or upload it on their Submit Testimony form.',
  },
  {
    title: 'Beat the 24-hour deadline',
    body: 'Submit at least 24 hours before the hearing so the committee reads it in time.',
  },
  {
    title: 'Mark it submitted',
    body: 'Back here, mark the testimony as submitted so your board and this page track your progress.',
  },
];

interface FlatDeadline {
  name: string;
  date: string;
}

function humanize(key: string): string {
  return key
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Flattens the session-deadlines JSON into named, sortable entries. */
function flattenDeadlines(deadlines: SessionDeadlines): FlatDeadline[] {
  const flat: FlatDeadline[] = [];
  for (const [key, value] of Object.entries(deadlines.deadlines)) {
    if (typeof value === 'string') {
      flat.push({ name: humanize(key), date: value });
    } else {
      for (const [chamber, date] of Object.entries(value)) {
        flat.push({ name: `${humanize(key)} (${chamber})`, date });
      }
    }
  }
  return flat.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Right rail for the Testimonies pages: the official how-to video, a
 * condensed submission guide, and the session's upcoming deadlines.
 */
export function TestimoniesSidebar() {
  const deadlines = flattenDeadlines(SESSION_DEADLINES);
  const today = new Date().toISOString().split('T')[0];
  const upcoming = deadlines.filter((d) => d.date >= today).slice(0, 3);
  const sineDie = SESSION_DEADLINES.deadlines.adjournment_sine_die;

  return (
    <div className="space-y-4">
      {/* Official how-to video */}
      <section className="overflow-hidden rounded-lg border bg-card" aria-label="Video guide">
        <div className="aspect-video w-full">
          <iframe
            className="h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${VIDEO_ID}`}
            title={VIDEO_TITLE}
            loading="lazy"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
        <div className="p-3">
          <p className="text-sm font-medium leading-snug">{VIDEO_TITLE}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Official video by the Hawai&lsquo;i State Senate.
          </p>
        </div>
      </section>

      {/* Condensed submission guide */}
      <section className="rounded-lg border bg-card p-4" aria-label="How testimony works">
        <h3 className="mb-3 text-sm font-semibold">How testimony works</h3>
        <ol className="space-y-3">
          {GUIDE_STEPS.map((step, index) => (
            <li key={index} className="flex gap-2.5">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium leading-snug">
                  {index + 1}. {step.title}
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <Button asChild variant="outline" size="sm" className="mt-4 w-full">
          <a
            href="https://www.capitol.hawaii.gov/submittestimony.aspx"
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            Submit Testimony on capitol.hawaii.gov
          </a>
        </Button>
      </section>

      {/* Session deadlines */}
      <section className="rounded-lg border bg-card p-4" aria-label="Session deadlines">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
          <CalendarDays className="h-4 w-4 text-primary" />
          {SESSION_DEADLINES.session} session deadlines
        </h3>
        {upcoming.length > 0 ? (
          <ul className="space-y-2">
            {upcoming.map((deadline) => (
              <li key={`${deadline.name}-${deadline.date}`} className="flex items-baseline justify-between gap-2">
                <span className="text-sm text-foreground/80">{deadline.name}</span>
                <span className="shrink-0 text-xs font-medium text-muted-foreground">
                  {new Date(deadline.date + 'T00:00:00').toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            The session adjourned sine die on{' '}
            {new Date(sineDie + 'T00:00:00').toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
            })}
            . Deadlines will return next session.
          </p>
        )}
      </section>
    </div>
  );
}
