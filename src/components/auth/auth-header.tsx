'use client';

import { Suspense } from 'react';
import { useAuth } from '@/hooks/contexts/auth-context';
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
        // A single trigger keeps the header's right track narrow enough that it
        // never crowds the centered sub-nav on mobile. The dialog itself offers
        // the route to registration.
        <LoginDialog />
      )}
    </div>
  );
}