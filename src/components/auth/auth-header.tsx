'use client';

import { LogIn, MessageSquareText } from 'lucide-react';
import { useAuth } from '@/hooks/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { FEEDBACK_FORM_URL } from '@/lib/core/feedback';
import { LoginLink } from './login-link';
import { UserMenu } from './user-menu';

export function AuthHeader() {

  //gets auth state from context
  const { user, loading } = useAuth();

  //shows loading spinner while checking auth
  if (loading) {
    return (
      <div className="flex items-center space-x-4">
        <div className="h-8 w-8 animate-pulse rounded-full bg-gray-200" />
      </div>
    );
  }


  //sows different UI based on auth states
  return (
    <div className="flex items-center space-x-4 ">
      {user ? (
        <UserMenu />   //shows user menu if logged in
      ) : (
        // Signed-out users have no account menu, so the feedback link lives here
        // beside the login trigger. Login is the primary action and anchors the
        // right edge; feedback sits after it as a compact icon-only button so it
        // reads as secondary and never crowds the centered sub-nav. The label is
        // carried by the tooltip + aria-label. The login page offers sign-up.
        // Tighter gap keeps the login/feedback pair reading as one cluster.
        <div className="flex items-center gap-1">
          <Button asChild variant="outline" className="h-10 shadow-sm text-primary bg-white">
            <LoginLink>
              <LogIn className="mr-1" />
              Login
            </LoginLink>
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                asChild
                variant="outline"
                size="icon"
                className="h-10 w-10 shadow-sm text-primary bg-white"
              >
                <a href={FEEDBACK_FORM_URL} target="_blank" rel="noopener noreferrer" aria-label="Feedback">
                  <MessageSquareText className="h-4 w-4" />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Feedback</TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );
}