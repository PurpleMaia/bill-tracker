'use client';

import { useAuth } from '@/hooks/contexts/auth-context';
import { LoginDialog } from './login-dialog';
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
        // A single trigger keeps the header's right track narrow enough that it
        // never crowds the centered sub-nav on mobile. The dialog itself offers
        // the route to registration.
        <LoginDialog />
      )}
    </div>
  );
}