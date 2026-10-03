'use client';

import { Suspense } from 'react';
import { MessageSquareText } from 'lucide-react';
import { useAuth } from '@/hooks/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { FEEDBACK_FORM_URL } from '@/lib/core/feedback';
import { LoginDialog } from './login-dialog';
import { UserMenu } from './user-menu';
import { AuthErrorToast } from './auth-error-toast';

export function AuthHeader() {

  //gets auth state from context
  const { user, loading } = useAuth();

  //shows loading spinner while checking auth
  // Rendered in both branches: an OAuth failure redirect lands while auth is
  // still resolving, and the early return below would otherwise swallow it.
  // Suspense is required because useSearchParams suspends during prerender.
  const authErrorToast = (
    <Suspense fallback={null}>
      <AuthErrorToast />
    </Suspense>
  );

  if (loading) {
    return (
      <div className="flex items-center space-x-4">
        {authErrorToast}
        <div className="h-8 w-8 animate-pulse rounded-full bg-gray-200" />
      </div>
    );
  }


  //sows different UI based on auth states
  return (
    <div className="flex items-center space-x-4 ">
      {authErrorToast}
      {user ? (
        <UserMenu />   //shows user menu if logged in
      ) : (
        // Signed-out users have no account menu, so the feedback link lives here
        // beside the login trigger. Login is the primary action and anchors the
        // right edge; feedback sits after it as a compact icon-only button so it
        // reads as secondary and never crowds the centered sub-nav. The label is
        // carried by the tooltip + aria-label. The dialog offers registration.
        <>
          <LoginDialog />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="text-primary-foreground hover:bg-white/10 hover:text-primary-foreground"
              >
                <a href={FEEDBACK_FORM_URL} target="_blank" rel="noopener noreferrer" aria-label="Feedback">
                  <MessageSquareText className="h-4 w-4" />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Feedback</TooltipContent>
          </Tooltip>
        </>
      )}
    </div>
  );
}