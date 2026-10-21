'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { loginHref } from '@/lib/auth/return-path';

interface LoginLinkProps extends Omit<React.ComponentProps<typeof Link>, 'href'> {
  /**
   * Where to land after logging in. Defaults to the current page, so the
   * visitor keeps their place; pass one when the prompt stands for a specific
   * destination (e.g. "Login to write a testimony" → the testimony page).
   */
  next?: string;
}

/**
 * A link to /login that returns here afterwards. Every logged-out prompt uses
 * this, styled by its parent: `<Button asChild><LoginLink>…</LoginLink></Button>`.
 *
 * The href is built from the pathname alone, because useSearchParams would force
 * a Suspense boundary on every page that renders a prompt. A plain click adds
 * the live query string (e.g. search filters) before navigating; a middle-click
 * or copied link still works, just without it.
 */
export function LoginLink({ next, onClick, ...props }: LoginLinkProps) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <Link
      {...props}
      href={loginHref(next ?? pathname)}
      onClick={(e) => {
        onClick?.(e);
        if (next || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        router.push(loginHref(window.location.pathname + window.location.search));
      }}
    />
  );
}
