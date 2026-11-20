export interface RecommendationTopic {
  id: string;
  label: string;
  /** Lowercase phrases; each is matched whole, never split into words. */
  terms: string[];
}

export const RECOMMENDATION_TOPICS: RecommendationTopic[] = [
  {
    id: 'food-access',
    label: 'Food Access',
    terms: ['food insecurity', 'food bank', 'food pantry', 'snap', 'ebt', 'wic', 'double up food bucks', 'hunger'],
  },
  {
    id: 'farmer-support',
    label: 'Farmer Support',
    terms: ['farmer', 'rancher', 'agricultural loan', 'agricultural grant', 'beginning farmer', 'agricultural workforce', 'farm labor'],
  },
  {
    id: 'local-food-system',
    label: 'Local Food System Development',
    terms: ['local food', 'locally grown', 'food hub', 'food processing', 'value-added', 'food self-sufficiency', 'food sustainability'],
  },
  {
    id: 'soil-ecosystem',
    label: 'Soil & Ecosystem Health',
    terms: ['soil health', 'regenerative', 'carbon sequestration', 'compost', 'pesticide', 'invasive species', 'watershed'],
  },
  {
    id: 'land-access',
    label: 'Land Access',
    terms: ['agricultural land', 'important agricultural lands', 'agricultural lease', 'agricultural park', 'land trust', 'kuleana'],
  },
  {
    id: 'farm-to-school',
    label: 'Farm to School',
    terms: ['farm to school', 'school meal', 'school lunch', 'school garden', 'cafeteria', 'keiki'],
  },
  {
    id: 'aquaponics-fishpond',
    label: 'Aquaponics/Fishpond',
    terms: ['aquaponics', 'aquaculture', 'fishpond', "loko i'a", 'loko iʻa', 'fisheries', 'limu'],
  },
  {
    id: 'emergency-preparedness',
    label: 'Emergency Preparedness',
    terms: ['emergency preparedness', 'food security', 'disaster', 'resilience', 'food stockpile'],
  },
  {
    id: 'water',
    label: 'Water',
    terms: ['water', 'irrigation', 'water rights', 'stream', 'aquifer', 'ditch'],
  },
];

export const MAX_KEYWORDS = 10;
export const MIN_KEYWORD_LENGTH = 2;
export const MAX_KEYWORD_LENGTH = 40;

/** Sanitize untrusted interests: known topic ids only, trimmed/lowercased/deduped/capped keywords. */
export function normalizeInterests(input: { topics?: unknown; keywords?: unknown }): {
  topics: string[];
  keywords: string[];
} {
  const known = new Set(RECOMMENDATION_TOPICS.map((t) => t.id));
  const topics = Array.isArray(input.topics)
    ? [...new Set(input.topics.filter((t): t is string => typeof t === 'string' && known.has(t)))]
    : [];

  const keywords: string[] = [];
  if (Array.isArray(input.keywords)) {
    for (const raw of input.keywords) {
      if (typeof raw !== 'string') continue;
      const kw = raw.trim().toLowerCase();
      if (kw.length < MIN_KEYWORD_LENGTH || kw.length > MAX_KEYWORD_LENGTH) continue;
      if (keywords.includes(kw)) continue;
      keywords.push(kw);
      if (keywords.length >= MAX_KEYWORDS) break;
    }
  }
  return { topics, keywords };
}

export interface InterestTerm {
  /** Topic label, or the keyword itself for custom keywords. */
  label: string;
  term: string;
}

/** Expand stored interests into match terms; topic ids no longer in the catalog are ignored. */
export function buildInterestTerms(topics: string[], keywords: string[]): InterestTerm[] {
  const result: InterestTerm[] = [];
  for (const topic of RECOMMENDATION_TOPICS) {
    if (!topics.includes(topic.id)) continue;
    for (const term of topic.terms) result.push({ label: topic.label, term });
  }
  for (const kw of keywords) result.push({ label: kw, term: kw });
  return result;
}

/** `%term%` for ILIKE with `\`, `%`, `_` escaped so they match literally. */
export function likeContainsPattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, '\\$&')}%`;
}
