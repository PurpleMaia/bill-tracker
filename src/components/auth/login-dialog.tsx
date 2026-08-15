'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { ArrowLeft, LogIn, MailCheck } from 'lucide-react';
import { GoogleSignInButton } from './google-sign-in-button';

interface LoginDialogProps {
  /**
   * Replaces the default Login button. Use where the prompt to sign in belongs
   * to another affordance (e.g. a gated Follow button) rather than the header.
   */
  trigger?: React.ReactNode;
}

export function LoginDialog({ trigger }: LoginDialogProps = {}) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const { login } = useAuth();
  const { toast } = useToast();

  // The dialog swaps between signing in and requesting a reset link.
  const [view, setView] = useState<'login' | 'forgot'>('login');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);

  const showLogin = () => {
    setView('login');
    setForgotEmail('');
    setForgotSent(false);
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    // Reopening should always land on the login form, never a stale forgot view.
    if (!open) showLogin();
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      });

      if (response.ok) {
        // The API answers identically whether or not the account exists, so the
        // confirmation here must stay just as non-committal.
        setForgotSent(true);
      } else {
        const data = await response.json().catch(() => ({}));
        toast({
          title: 'Could not send reset link',
          description: typeof data.error === 'string' ? data.error : 'Please try again.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {

      //calls login from auth context
      const result = await login(identifier, password);

      if (result && result.success) {
        //shows success message
        toast({
          title: 'Success!',
          description: 'You are now logged in.',
        });

        //closes dialog and clears form
        setIsOpen(false);
        setIdentifier('');
        setPassword('');
      } else if (result && result.error) {
        //shows error message from context
        toast({
          title: 'Login Failed',
          description: result.error,
          variant: 'destructive',
        });
      } else {
        //generic error message
        toast({
          title: 'Login Failed',
          description: 'An unknown error occurred.',
          variant: 'destructive',
        });        
      } 
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" className="h-10 shadow-sm text-primary bg-white">
            <LogIn className="mr-1" />
            Login
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-[420px]">
        {/* Title is visually hidden in the login view — the form's fields and
            submit button already say what this is — but kept in the DOM so the
            dialog always has an accessible name. The reset view keeps it
            visible, since that state does need explaining. */}
        <DialogHeader className={view === 'login' ? 'sr-only' : 'space-y-1 text-left'}>
          <DialogTitle className="text-base font-semibold leading-tight">
            {view === 'login' ? 'Login' : 'Reset your password'}
          </DialogTitle>
          <DialogDescription className="text-xs leading-snug">
            {view === 'login'
              ? 'Login to track bills with your organization.'
              : 'We’ll email you a link to choose a new one.'}
          </DialogDescription>
        </DialogHeader>

        <div className="pt-1">
          {view === 'forgot' ? (
            forgotSent ? (
              <div className="space-y-5">
                <div className="flex flex-col items-center gap-3 py-2 text-center">
                  <span
                    aria-hidden
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-primary"
                  >
                    <MailCheck className="h-5 w-5" />
                  </span>
                  <p className="text-sm text-muted-foreground">
                    If an account exists for{' '}
                    <span className="font-medium text-foreground">{forgotEmail}</span>, we&apos;ve
                    sent a reset link. It expires in 1 hour.
                  </p>
                </div>
                <Button type="button" variant="outline" className="w-full" onClick={showLogin}>
                  <ArrowLeft className="mr-1" />
                  Back to log in
                </Button>
              </div>
            ) : (
              <form onSubmit={handleForgotSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="forgot-email">Email</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    autoComplete="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Sending…' : 'Send reset link'}
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={showLogin}>
                  <ArrowLeft className="mr-1" />
                  Back to log in
                </Button>
              </form>
            )
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="identifier">Email or username</Label>
                  <Input
                    id="identifier"
                    type="text"
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                </div>

                <div className="space-y-2">
                  {/* Label and the reset affordance share a row, so the link sits
                      with the field it acts on instead of drifting below it. */}
                  <div className="flex items-baseline justify-between gap-2">
                    <Label htmlFor="password">Password</Label>
                    <button
                      type="button"
                      onClick={() => setView('forgot')}
                      className="rounded-sm text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                  />
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Logging in…' : 'Login'}
                </Button>
              </form>

              {/* Google sits directly under the login button as an alternative
                  way to sign in, above the sign-up divider — email/password
                  stays the default path. */}
              <div className="relative my-4">
                <div aria-hidden className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-background px-2 text-xs uppercase tracking-wide text-muted-foreground">
                    or
                  </span>
                </div>
              </div>

              <GoogleSignInButton onNavigate={() => setIsOpen(false)} />

              {/* Sign-up is a genuinely separate destination, so it reads as its
                  own action below a divider rather than as inline link text. */}
              <div className="relative my-5">
                <div aria-hidden className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-background px-2 text-xs uppercase tracking-wide text-muted-foreground">
                    New to Bill Tracker?
                  </span>
                </div>
              </div>

              <Button asChild variant="outline" className="w-full">
                <Link href="/register" onClick={() => setIsOpen(false)}>
                  Create an account
                </Link>
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}