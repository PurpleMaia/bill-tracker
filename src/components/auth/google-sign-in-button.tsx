'use client';

import { Button } from '@/components/ui/button';

/**
 * Google's official "G" mark.
 *
 * Inlined as SVG rather than an icon-font glyph or a recolored generic icon
 * because Google's branding requirements for Sign in with Google require the
 * mark's four brand colors be reproduced exactly.
 */
function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4 shrink-0">
      <path
        fill="#4285F4"
        d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.036-3.7104H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2823-1.71V4.9582H.9574C.3477 6.1732 0 7.5477 0 9s.3477 2.8268.9574 4.0418L3.964 10.71z"
      />
      <path
        fill="#EA4335"
        d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9574 4.9582L3.964 7.29C4.6718 5.1627 6.656 3.5795 9 3.5795z"
      />
    </svg>
  );
}

interface GoogleSignInButtonProps {
  /** Invite token to carry through the OAuth round trip, when signing up from an invite. */
  inviteToken?: string | null;
  /** Organization to create for the new user, when signing up with an org name. */
  orgName?: string | null;
  /** Defaults to the sign-in wording; set for the registration context. */
  label?: string;
  /** Called before navigating away, e.g. to close the dialog. */
  onNavigate?: () => void;
}

/**
 * Starts Google sign-in.
 *
 * A real link, not a fetch: OAuth requires a full-page navigation to Google, so
 * this is the one auth affordance that does not go through the data-client.
 */
export function GoogleSignInButton({
  inviteToken,
  orgName,
  label = 'Continue with Google',
  onNavigate,
}: GoogleSignInButtonProps) {
  const params = new URLSearchParams();
  if (inviteToken) params.set('invite', inviteToken);
  if (orgName) params.set('orgName', orgName);

  const query = params.toString();
  const href = query ? `/api/auth/google?${query}` : '/api/auth/google';

  return (
    <Button asChild variant="outline" className="w-full">
      {/* Plain <a>, not next/link: this leaves the app entirely, so client-side
          routing has nothing to prefetch or intercept. */}
      <a href={href} onClick={onNavigate}>
        <GoogleMark />
        <span className="ml-2">{label}</span>
      </a>
    </Button>
  );
}
