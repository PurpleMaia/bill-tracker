import { describe, it, expect } from 'vitest';
import { GLOSSARY } from '@/lib/glossary/terms';
import { PROGRESS_STAGES } from '@/lib/bills/progress-stages';

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
    for (const [slug, entry] of Object.entries(GLOSSARY)) {
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
