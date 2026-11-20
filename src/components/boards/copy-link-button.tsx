'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Link as LinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/core/utils';

const RESET_MS = 2000;

/**
 * Copy button for a shareable link (e.g. an org's public board): the icon swaps
 * to a check for a moment on success, then back. Icon-only by default; with
 * `text` it's a labeled button with a link icon. If the clipboard is blocked, a
 * toast carries the URL so it can be copied by hand.
 */
export function CopyLinkButton({
  url,
  label = 'Copy link',
  text,
  variant = 'outline',
  className,
}: {
  url: string;
  /** Accessible name and hover tooltip. */
  label?: string;
  /** Visible label; when set, the button shows it beside a link icon. */
  text?: string;
  variant?: 'outline' | 'default' | 'ghost';
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), RESET_MS);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      toast({ title: 'Couldn’t copy the link', description: url, duration: 8000 });
    }
  };

  if (text) {
    return (
      <Button
        type="button"
        size="sm"
        variant={variant}
        onClick={copy}
        title={label}
        className={cn(
          'shrink-0',
          variant !== 'default' && 'hover:bg-neutral-100 hover:text-foreground',
          className,
        )}
      >
        {copied ? <Check className="mr-1.5 h-4 w-4 text-olive-dark" /> : <LinkIcon className="mr-1.5 h-4 w-4" />}
        {/* aria-live so screen readers hear the swap to "Copied". */}
        <span aria-live="polite">{copied ? 'Copied' : text}</span>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size="icon"
      variant={variant}
      onClick={copy}
      aria-label={label}
      title={copied ? 'Copied' : label}
      className={cn(
        'h-9 w-9 shrink-0',
        // A light gray on hover, not the outline variant's solid teal fill: the
        // icon keeps its color (so the check stays visible), and a neutral tint
        // doesn't clash with the olive "Your organization" card. Plain neutral,
        // since the theme's muted is cream and secondary is teal.
        variant !== 'default' && 'hover:bg-neutral-100 hover:text-foreground',
        className,
      )}
    >
      {copied ? <Check className="h-4 w-4 text-olive-dark" /> : <Copy className="h-4 w-4" />}
      {/* The icon swap is silent to screen readers; announce it. */}
      <span className="sr-only" aria-live="polite">
        {copied ? 'Copied' : ''}
      </span>
    </Button>
  );
}
