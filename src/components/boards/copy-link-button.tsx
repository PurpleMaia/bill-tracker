'use client';

import { useEffect, useState } from 'react';
import { Check, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/core/utils';

/**
 * Copies a shareable link (e.g. an org's public board) to the clipboard. Shows
 * a check for a moment on success; if the clipboard is blocked, the toast
 * carries the URL so it can still be copied by hand.
 */
export function CopyLinkButton({
  url,
  label = 'Copy link',
  variant = 'outline',
  className,
}: {
  url: string;
  label?: string;
  variant?: 'outline' | 'default' | 'ghost';
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({ title: 'Link copied', duration: 3000 });
    } catch {
      toast({ title: 'Couldn’t copy the link', description: url, duration: 8000 });
    }
  };

  return (
    <Button type="button" size="sm" variant={variant} onClick={copy} className={cn('shrink-0', className)}>
      {copied ? <Check className="h-4 w-4 sm:mr-1.5" /> : <Link2 className="h-4 w-4 sm:mr-1.5" />}
      <span className="sr-only sm:not-sr-only">{copied ? 'Copied' : label}</span>
    </Button>
  );
}
