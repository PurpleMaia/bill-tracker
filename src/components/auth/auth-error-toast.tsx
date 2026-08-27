'use client';

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

/**
 * User-facing text for the `?authError=` codes the Google callback redirects
 * with. Deliberately vague about which account exists — an error message is
 * not a place to confirm whether an address is registered.
 */
const AUTH_ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
  not_configured: {
    title: 'Google sign-in unavailable',
    description: 'Google sign-in is not configured on this server. Please use email and password.',
  },
  state_mismatch: {
    title: 'Sign-in expired',
    description: 'That sign-in attempt expired or could not be verified. Please try again.',
  },
  access_denied: {
    title: 'Sign-in cancelled',
    description: 'You cancelled Google sign-in.',
  },
  exchange_failed: {
    title: 'Sign-in failed',
    description: "We couldn't complete sign-in with Google. Please try again.",
  },
  unverified_email: {
    title: 'Email not verified',
    description:
      'Google has not verified the email on that account, so we cannot use it to sign in. Verify it with Google, or use email and password.',
  },
  account_inactive: {
    title: 'Account inactive',
    description: 'This account is not active. Please contact support.',
  },
  invite_invalid: {
    title: 'Invite could not be applied',
    description:
      "You're signed in, but that invite was invalid, expired, or already used. Ask your admin for a new one.",
  },
  rate_limited: {
    title: 'Too many attempts',
    description: 'Too many sign-in attempts. Please wait a few minutes and try again.',
  },
  unknown: {
    title: 'Sign-in failed',
    description: 'Something went wrong during sign-in. Please try again.',
  },
};

/**
 * Renders `?authError=` as a toast and strips it from the URL.
 *
 * The OAuth callback is a redirect, so it has no way to hand a message to the
 * client except through the query string. Cleaning the param afterwards keeps
 * the error from reappearing on refresh or being captured in a shared link.
 */
export function AuthErrorToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const shown = useRef<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('authError');
    if (!code) return;

    // React 18 runs effects twice in dev; without this the toast doubles.
    if (shown.current === code) return;
    shown.current = code;

    const message = AUTH_ERROR_MESSAGES[code] ?? AUTH_ERROR_MESSAGES.unknown;
    toast({
      title: message.title,
      description: message.description,
      // invite_invalid accompanies a SUCCESSFUL sign-in, so it reads as a
      // warning rather than a failure.
      variant: code === 'invite_invalid' ? 'default' : 'destructive',
    });

    const params = new URLSearchParams(searchParams.toString());
    params.delete('authError');
    const query = params.toString();
    router.replace(query ? `?${query}` : window.location.pathname, { scroll: false });
  }, [searchParams, router, toast]);

  return null;
}
