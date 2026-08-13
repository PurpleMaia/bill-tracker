// Turn runtime bill data into glossary entries by DELEGATING to the copy that
// already exists — COLUMN_DESCRIPTIONS, committeeFullName, describeVersionLabel.
// Nothing here duplicates that prose; duplicating it would guarantee drift.
//
// Each resolver returns null when there is genuinely no definition, so callers
// render plain text instead of an affordance that opens an empty card. That
// null path is load-bearing, not an edge case.
import type { GlossaryTerm } from './terms';
import { GLOSSARY } from './terms';
import { COLUMN_DESCRIPTIONS, COLUMN_TITLES } from '@/lib/bills/kanban-columns';
import { COMMITTEE_NAMES, committeeFullName } from '@/lib/testimony/committees';
import { describeVersionLabel } from '@/lib/versions/version-labels';

/** Status id -> COLUMN_DESCRIPTIONS copy. */
export function resolveStatusTerm(statusId: string): GlossaryTerm | null {
  const short = COLUMN_DESCRIPTIONS[statusId];
  if (!short) return null;
  return { term: COLUMN_TITLES[statusId] ?? statusId, short };
}

/**
 * Committee code -> full name. Returns null unless EVERY token in a joint
 * referral is known: committeeFullName passes unknown codes through unchanged,
 * so trusting it alone would "define" XYZ as "XYZ".
 */
export function resolveCommitteeTerm(code: string): GlossaryTerm | null {
  const trimmed = code.trim();
  if (!trimmed) return null;

  const tokens = trimmed
    .split('/')
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
  if (!tokens.length) return null;
  if (!tokens.every((t) => t in COMMITTEE_NAMES)) return null;

  const fullName = committeeFullName(trimmed);
  return {
    term: trimmed.toUpperCase(),
    short: `${fullName} — ${GLOSSARY.committee.short}`,
    learnMoreAnchor: GLOSSARY.committee.learnMoreAnchor,
  };
}

/** Version label -> pipeline position. Null when the label is unrecognized. */
export function resolveVersionTerm(label: string): GlossaryTerm | null {
  const described = describeVersionLabel(label);
  if (!described) return null;
  return {
    term: label.trim(),
    short: `${described}. ${GLOSSARY['bill-version'].short}`,
    learnMoreAnchor: GLOSSARY['bill-version'].learnMoreAnchor,
  };
}

/**
 * Deadline name -> Tier 3 jargon. Names come from dead-bill.ts and combine a
 * qualifier with the jargon ("First Decking", "Final Decking (Fiscal)").
 *
 * Order matters: "Single Referral Filing" and "Triple Referral Filing" both
 * contain "Referral", so the specific tests must come first.
 */
export function resolveDeadlineTerm(deadlineName: string): GlossaryTerm | null {
  const name = deadlineName.toLowerCase();
  if (name.includes('single referral')) return GLOSSARY['single-referral-filing'];
  if (name.includes('triple referral')) return GLOSSARY['triple-referral'];
  if (name.includes('sine die')) return GLOSSARY['sine-die'];
  if (name.includes('decking')) return GLOSSARY.decking;
  if (name.includes('lateral')) return GLOSSARY.lateral;
  if (name.includes('crossover')) return GLOSSARY.crossover;
  return null;
}
