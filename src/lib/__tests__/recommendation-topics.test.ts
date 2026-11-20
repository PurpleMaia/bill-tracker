import { describe, it, expect } from 'vitest';
import {
  RECOMMENDATION_TOPICS,
  MAX_KEYWORDS,
  normalizeInterests,
  buildInterestTerms,
  likeContainsPattern,
} from '@/lib/bills/recommendation-topics';

describe('RECOMMENDATION_TOPICS', () => {
  it('has unique kebab-case ids', () => {
    const ids = RECOMMENDATION_TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('has at least 3 lowercase non-empty terms per topic', () => {
    for (const topic of RECOMMENDATION_TOPICS) {
      expect(topic.terms.length).toBeGreaterThanOrEqual(3);
      for (const term of topic.terms) {
        expect(term.length).toBeGreaterThan(0);
        expect(term).toBe(term.toLowerCase());
      }
    }
  });
});

describe('normalizeInterests', () => {
  it('filters unknown topics, dedupes, trims and lowercases keywords', () => {
    expect(
      normalizeInterests({
        topics: ['farm-to-school', 'nope', 'farm-to-school'],
        keywords: ['  Kalo ', 'kalo', 'a', 'x'.repeat(41), 42],
      }),
    ).toEqual({ topics: ['farm-to-school'], keywords: ['kalo'] });
  });

  it('caps keywords at MAX_KEYWORDS', () => {
    const keywords = Array.from({ length: 12 }, (_, i) => `keyword${i}`);
    const result = normalizeInterests({ keywords });
    expect(result.keywords).toEqual(keywords.slice(0, MAX_KEYWORDS));
  });

  it('returns empty lists for non-array input', () => {
    expect(normalizeInterests({ topics: 'x', keywords: null })).toEqual({
      topics: [],
      keywords: [],
    });
    expect(normalizeInterests({})).toEqual({ topics: [], keywords: [] });
  });
});

describe('buildInterestTerms', () => {
  it('keeps multi-word terms whole and labels topics and keywords', () => {
    const terms = buildInterestTerms(['farm-to-school', 'removed-topic'], ['kalo']);
    expect(terms).toContainEqual({ label: 'Farm to School', term: 'school meal' });
    expect(terms).toContainEqual({ label: 'kalo', term: 'kalo' });
    expect(terms.every((t) => t.label !== 'removed-topic')).toBe(true);
    expect(terms.length).toBe(
      RECOMMENDATION_TOPICS.find((t) => t.id === 'farm-to-school')!.terms.length + 1,
    );
  });
});

describe('likeContainsPattern', () => {
  it('escapes LIKE metacharacters', () => {
    expect(likeContainsPattern('100%_a\\b')).toBe('%100\\%\\_a\\\\b%');
  });
});
