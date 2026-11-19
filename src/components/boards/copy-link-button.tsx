'use client';

import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/core/utils';

const RESET_MS = 2000;

/**
 * Icon-only copy button for a shareable link (e.g. an org's public board): the
 * copy icon swaps to a check for a moment on success, then back. If the
 * clipboard is blocked, a toast carries the URL so it can be copied by hand.
 */
export function CopyLinkButton({
  url,
  label = 'Copy link',
  variant = 'outline',
  className,
}: {
  url: string;
  /** Accessible name and hover tooltip. */
  label?: string;
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
        // A light teal tint on hover, not the outline variant's solid fill —
        // the icon keeps its color, so the check stays visible.
        variant !== 'default' && 'hover:bg-primary/10 hover:text-foreground',
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
