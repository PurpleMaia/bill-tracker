'use client';

import { useMemo } from 'react';
import { generateHTML } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import type { TestimonyMeta } from '@/lib/testimony-export/blocks';
import { composeHeaderLines } from '@/lib/testimony-export/blocks';
import { cn } from '@/lib/utils';

interface TestimonyPreviewProps {
  meta: TestimonyMeta;
  contentJson: unknown;
}

export function TestimonyPreview({ meta, contentJson }: TestimonyPreviewProps) {
  const bodyHtml = useMemo(() => {
    try {
      return generateHTML(contentJson as Record<string, unknown>, [
        StarterKit.configure({ blockquote: false, codeBlock: false, code: false, horizontalRule: false }),
        Underline,
        TextStyle,
        FontFamily,
      ]);
    } catch {
      return '<p></p>';
    }
  }, [contentJson]);

  const headerLines = composeHeaderLines(meta);

  return (
    <div className="rounded-lg border bg-white p-8 shadow-sm">
      <div className="mb-6 space-y-0.5 text-center">
        {headerLines.map((line, index) => (
          <p key={index} className={cn('text-sm', index === 0 && 'font-semibold')}>
            {line}
          </p>
        ))}
      </div>
      <div
        className={cn(
          'text-sm leading-relaxed',
          '[&_h1]:text-3xl [&_h1]:font-bold [&_h1]:my-3',
          '[&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:my-3',
          '[&_h3]:text-xl [&_h3]:font-semibold [&_h3]:my-2',
          '[&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6',
        )}
        // Content is the user's own Tiptap doc; generateHTML escapes text nodes.
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
    </div>
  );
}
