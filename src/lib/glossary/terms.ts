// Static glossary for legislative jargon. PURE — no DB, no network, no React.
//
// Terms whose copy already exists elsewhere (statuses, committee names, version
// positions) are NOT duplicated here; they resolve through ./resolvers.ts.
// This file holds only vocabulary that had no home before.
//
// Every `short` is written for someone who has never followed politics: no
// assumed vocabulary, and where a term only makes sense as part of a sequence,
// `learnMoreAnchor` points at the /learn stage that supplies the causation.

export interface GlossaryTerm {
  term: string;
  /** Tooltip body. Keep to ~45 words — it has to fit a 375px popover. */
  short: string;
  /** A PROGRESS_STAGES id in /learn. Only for terms whose meaning depends on
   *  the surrounding sequence; most terms need no second tier. */
  learnMoreAnchor?: string;
}

export const GLOSSARY = {
  'bill-number': {
    term: 'Bill number',
    short:
      'The bill\'s permanent ID. "HB" means it started in the House, "SB" in the Senate. The number is just the filing order — a lower number does not mean the bill matters more.',
    learnMoreAnchor: 'introduced',
  },
  'relating-to': {
    term: '"Relating to" title',
    short:
      'The bill\'s official subject line, always written as "RELATING TO …". It is a legal label for the area of law being changed, not a summary of what the bill does.',
  },
  introducers: {
    term: 'Introducers',
    short:
      'The legislators who formally filed the bill. The first name listed is usually the lead sponsor. Introducing a bill is not the same as voting for it later.',
  },
  committee: {
    term: 'Committee',
    short:
      'A small group of legislators that reviews bills on one subject before the full chamber sees them. A bill must clear every committee it is referred to, in order, to stay alive.',
    learnMoreAnchor: 'orig-chamber',
  },
  'committee-chair': {
    term: 'Committee chair',
    short:
      'The legislator who runs a committee and decides which bills get a hearing. A chair who never schedules a bill kills it without any vote being taken — this is how most bills die.',
    learnMoreAnchor: 'orig-chamber',
  },
  'committee-report': {
    term: 'Committee report',
    short:
      'The document a committee publishes after voting on a bill. It records the committee\'s recommendation and explains any changes it made to the text.',
  },
  'report-code': {
    term: 'Report code',
    short:
      'An ID for a committee report. "HSCR" is a House standing committee report, "SSCR" the Senate equivalent, and "CCR" a conference committee report. The digits are just a counter.',
  },
  'bill-version': {
    term: 'Bill version',
    short:
      'A snapshot of the bill\'s text. Each committee can amend it, producing a new numbered draft, so one bill usually has several versions. Only the final one can become law.',
    learnMoreAnchor: 'orig-chamber',
  },
  crossover: {
    term: 'Crossover',
    short:
      'The point where a bill passes its first chamber and moves to the other one, which reviews it from the start. Both chambers must pass identical text, so this second pass is unavoidable.',
    learnMoreAnchor: 'non-orig-chamber',
  },
  conference: {
    term: 'Conference committee',
    short:
      'When the House and Senate pass different versions, negotiators from both meet to agree on one final text. If they miss the deadline, the bill dies despite passing both chambers.',
    learnMoreAnchor: 'conference',
  },
  fiscal: {
    term: 'Fiscal bill',
    short:
      'A bill that spends money or affects revenue, so it must also clear a money committee — Finance in the House or Ways and Means in the Senate. That extra stop gets its own later deadline.',
    learnMoreAnchor: 'orig-chamber',
  },
  chamber: {
    term: 'Chamber',
    short:
      'One of the legislature\'s two halves: the House (H) and the Senate (S). A bill must pass both. "H" or "S" here marks which chamber took the action.',
    learnMoreAnchor: 'non-orig-chamber',
  },
  // --- Tier 3: deadline jargon, explained nowhere before this feature ---
  decking: {
    term: 'Decking',
    short:
      'The deadline for publishing a bill\'s final text before a floor vote. Members must have the finished wording in hand a set number of days ahead, so missing the decking date stops the vote.',
    learnMoreAnchor: 'orig-chamber',
  },
  lateral: {
    term: 'Lateral',
    short:
      'The deadline for a bill to move sideways from one committee to the next within the same chamber. A bill still sitting in an earlier committee after this date is finished.',
    learnMoreAnchor: 'orig-chamber',
  },
  'sine-die': {
    term: 'Sine die',
    short:
      'Latin for "without a day" — the final adjournment that ends the session. Anything not passed by then dies and must be reintroduced from scratch next year.',
    learnMoreAnchor: 'law',
  },
  'triple-referral': {
    term: 'Triple referral',
    short:
      'A bill sent to three committees in one chamber. Each is another hearing that must be scheduled, so triple-referred bills have the least time and the lowest odds of surviving.',
    learnMoreAnchor: 'orig-chamber',
  },
  'single-referral-filing': {
    term: 'Single referral filing',
    short:
      'The deadline for bills referred to just one committee in a chamber. Because they have only one hearing to clear, their cutoff comes earlier than multi-committee bills.',
    learnMoreAnchor: 'orig-chamber',
  },
} as const satisfies Record<string, GlossaryTerm>;

export type TermSlug = keyof typeof GLOSSARY;
