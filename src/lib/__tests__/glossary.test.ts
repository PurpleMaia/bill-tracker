import { describe, it, expect } from 'vitest';
import { GLOSSARY, type GlossaryTerm } from '@/lib/glossary/terms';
import {
  resolveStatusTerm,
  resolveCommitteeTerm,
  resolveCommitteeListTerm,
  resolveVersionTerm,
  resolveDeadlineTerm,
} from '@/lib/glossary/resolvers';
import { PROGRESS_STAGES } from '@/lib/bills/progress-stages';
import { KANBAN_COLUMNS } from '@/lib/bills/kanban-columns';

describe('GLOSSARY', () => {
  it('gives every term a display name and a short definition', () => {
    for (const [slug, entry] of Object.entries(GLOSSARY)) {
      expect(entry.term.length, slug).toBeGreaterThan(0);
      expect(entry.short.length, slug).toBeGreaterThan(0);
    }
  });

  it('keeps short definitions short enough for a tooltip', () => {
    for (const [slug, entry] of Object.entries(GLOSSARY)) {
      expect(entry.short.split(/\s+/).length, slug).toBeLessThanOrEqual(45);
    }
  });

  it('points every learnMoreAnchor at a real /learn stage', () => {
    const anchors = new Set(PROGRESS_STAGES.map((s) => s.id));
    // Widen to GlossaryTerm: `as const satisfies` keeps each entry's literal
    // type, so entries without an anchor lack the optional key entirely and
    // reading it off the union does not compile. Consumers see GlossaryTerm.
    const entries = Object.entries(GLOSSARY) as [string, GlossaryTerm][];
    for (const [slug, entry] of entries) {
      if (!entry.learnMoreAnchor) continue;
      expect(anchors.has(entry.learnMoreAnchor), `${slug} -> ${entry.learnMoreAnchor}`).toBe(true);
    }
  });

  it('covers the Tier 3 deadline jargon', () => {
    for (const slug of ['decking', 'lateral', 'sine-die', 'triple-referral', 'single-referral-filing']) {
      expect(GLOSSARY, slug).toHaveProperty(slug);
    }
  });
});

describe('resolveStatusTerm', () => {
  it('resolves every kanban column to non-empty copy', () => {
    for (const col of KANBAN_COLUMNS) {
      if (col.id === 'unassigned') continue;
      const term = resolveStatusTerm(col.id);
      expect(term, col.id).not.toBeNull();
      expect(term!.short.length, col.id).toBeGreaterThan(0);
    }
  });

  it('returns null for an unknown status id', () => {
    expect(resolveStatusTerm('not-a-status')).toBeNull();
  });
});

describe('resolveCommitteeTerm', () => {
  it('expands a known committee code', () => {
    const term = resolveCommitteeTerm('FIN');
    expect(term).not.toBeNull();
    expect(term!.short).toContain('Finance');
  });

  it('handles a joint referral and flags it as joint', () => {
    const short = resolveCommitteeTerm('WLA/EIG')!.short;
    expect(short).toContain('/');
    expect(short.toLowerCase()).toContain('joint referral');
  });

  // committeeFullName passes unknown codes through unchanged, so a naive
  // implementation would "define" XYZ as "XYZ". That must be null instead.
  it('returns null for a code with no known name', () => {
    expect(resolveCommitteeTerm('XYZ')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(resolveCommitteeTerm('')).toBeNull();
  });
});

describe('resolveCommitteeListTerm', () => {
  it('joins the expansions for known codes', () => {
    const term = resolveCommitteeListTerm(['AGR', 'FIN']);
    expect(term).not.toBeNull();
    expect(term!.short).toContain('Agriculture');
    expect(term!.short).toContain('Finance');
  });

  // committeeFullName passes unknown codes through, so echoing them would
  // render "XYZ — XYZ" — the bogus affordance the null path exists to prevent.
  it('drops unknown codes but keeps known ones', () => {
    const term = resolveCommitteeListTerm(['AGR', 'XYZ']);
    expect(term!.short).toContain('Agriculture');
    expect(term!.short).not.toContain('XYZ');
  });

  it('returns null when no code is known', () => {
    expect(resolveCommitteeListTerm(['XYZ', 'QQQ'])).toBeNull();
    expect(resolveCommitteeListTerm([])).toBeNull();
  });
});

describe('resolveVersionTerm', () => {
  it('describes a recognized draft label', () => {
    const term = resolveVersionTerm('HB1494_HD1');
    expect(term).not.toBeNull();
    expect(term!.short).toContain('House, first committee draft');
  });

  it('describes a bare bill number as introduced', () => {
    expect(resolveVersionTerm('HB1494')!.short).toContain('As introduced');
  });

  // describeVersionLabel returns null for these on purpose — it refuses to
  // assert a pipeline position it cannot verify. The affordance must disappear.
  it('returns null where describeVersionLabel does', () => {
    expect(resolveVersionTerm('HB1494_HFA4')).toBeNull();
    expect(resolveVersionTerm('HB1494_PROPOSED')).toBeNull();
    expect(resolveVersionTerm('')).toBeNull();
  });
});

describe('resolveDeadlineTerm', () => {
  it('matches deadline names to Tier 3 jargon', () => {
    expect(resolveDeadlineTerm('First Decking')!.term).toBe('Decking');
    expect(resolveDeadlineTerm('Final Decking (Fiscal)')!.term).toBe('Decking');
    expect(resolveDeadlineTerm('Second Lateral')!.term).toBe('Lateral');
    expect(resolveDeadlineTerm('Adjournment Sine Die')!.term).toBe('Sine die');
    expect(resolveDeadlineTerm('First Triple Referral Filing')!.term).toBe('Triple referral');
    expect(resolveDeadlineTerm('Single Referral Filing (SBs)')!.term).toBe('Single referral filing');
  });

  it('returns null for an unrecognized deadline name', () => {
    expect(resolveDeadlineTerm('Some New Deadline')).toBeNull();
  });
});
