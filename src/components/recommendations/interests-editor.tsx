'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/core/utils';
import { Input } from '@/components/ui/input';
import {
  MAX_KEYWORDS,
  MAX_KEYWORD_LENGTH,
  MIN_KEYWORD_LENGTH,
  RECOMMENDATION_TOPICS,
  normalizeInterests,
} from '@/lib/bills/recommendation-topics';

export interface InterestsValue {
  topics: string[];
  keywords: string[];
}

interface InterestsEditorProps {
  value: InterestsValue;
  onChange: (v: InterestsValue) => void;
  disabled?: boolean;
}

/** Controlled editor for interest topics (toggle chips) and custom keywords. */
export function InterestsEditor({ value, onChange, disabled }: InterestsEditorProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const atCap = value.keywords.length >= MAX_KEYWORDS;

  const toggleTopic = (id: string) => {
    const topics = value.topics.includes(id)
      ? value.topics.filter((t) => t !== id)
      : [...value.topics, id];
    onChange(normalizeInterests({ topics, keywords: value.keywords }));
  };

  const addKeyword = (raw: string) => {
    const kw = raw.trim().toLowerCase();
    if (!kw) return;
    if (value.keywords.includes(kw)) {
      setDraft('');
      setError(null);
      return;
    }
    if (kw.length < MIN_KEYWORD_LENGTH || kw.length > MAX_KEYWORD_LENGTH) {
      setError(`Keywords must be ${MIN_KEYWORD_LENGTH}-${MAX_KEYWORD_LENGTH} characters.`);
      return;
    }
    if (atCap) {
      setError(`You can add up to ${MAX_KEYWORDS} keywords.`);
      return;
    }
    onChange(normalizeInterests({ topics: value.topics, keywords: [...value.keywords, kw] }));
    setDraft('');
    setError(null);
  };

  const removeKeyword = (kw: string) =>
    onChange(
      normalizeInterests({
        topics: value.topics,
        keywords: value.keywords.filter((k) => k !== kw),
      }),
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {RECOMMENDATION_TOPICS.map((topic) => {
          const selected = value.topics.includes(topic.id);
          return (
            <button
              key={topic.id}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => toggleTopic(topic.id)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50',
                selected
                  ? 'border-transparent bg-primary text-primary-foreground'
                  : 'bg-background text-foreground hover:bg-accent',
              )}
            >
              {topic.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        <Input
          value={draft}
          disabled={disabled || atCap}
          maxLength={MAX_KEYWORD_LENGTH + 10}
          aria-label="Add a keyword"
          placeholder={atCap ? 'Keyword limit reached' : 'Add your own keyword, then press Enter'}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          // Commit a typed-but-uncommitted keyword so clicking Save keeps it.
          onBlur={() => {
            if (draft.trim()) addKeyword(draft);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              addKeyword(draft);
            }
          }}
        />
        {value.keywords.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {value.keywords.map((kw) => (
              <li
                key={kw}
                className="inline-flex items-center gap-1 rounded-full border bg-secondary py-0.5 pl-2.5 pr-1 text-xs font-medium text-secondary-foreground"
              >
                {kw}
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`Remove ${kw}`}
                  onClick={() => removeKeyword(kw)}
                  className="rounded-full p-0.5 hover:bg-background/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p
          className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}
          role={error ? 'alert' : undefined}
        >
          {error ?? `Up to ${MAX_KEYWORDS} keywords (${value.keywords.length}/${MAX_KEYWORDS}).`}
        </p>
      </div>
    </div>
  );
}
