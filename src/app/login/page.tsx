"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, MailCheck } from "lucide-react";
import { useAuth } from "@/hooks/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { safeReturnPath, registerHref } from "@/lib/auth/return-path";
import { data } from "@/lib/data-client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, login } = useAuth();

  // Every login prompt in the app links here with ?next=<where they were>.
  const next = safeReturnPath(searchParams.get("next"));
  const signUpHref = registerHref(next);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // Shown in the card rather than as a toast: a new visitor who typed sign-up
  // details here needs the pointer to registration to stay put until they act.
  const [error, setError] = useState<{ message: string; suggestSignUp: boolean } | null>(null);

  // The page swaps between signing in and requesting a reset link.
  const [view, setView] = useState<"login" | "forgot">("login");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);

  // Already signed in (or just signed in): there is nothing to do here.
  useEffect(() => {
    if (!loading && user) router.replace(next);
  }, [loading, user, next, router]);

  const showLogin = () => {
    setView("login");
    setForgotEmail("");
    setForgotSent(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const result = await login(identifier, password);
      // On success login() sets `user`, and the effect above sends them on.
      if (result.success) return;
      setError(
        // 401 means the identifier/password pair matched nothing. The API does
        // not say which half was wrong (so it can't be used to probe for
        // accounts), and neither does this — but a 401 is exactly what a new
        // visitor who mistook this for sign-up hits, so point them onward.
        result.status === 401
          ? { message: "That username and password don't match an account.", suggestSignUp: true }
          : { message: result.error || "Login failed. Please try again.", suggestSignUp: false }
      );
    } catch {
      setError({ message: "An unexpected error occurred. Please try again.", suggestSignUp: false });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await data.auth.forgotPassword(forgotEmail);
      // The server answers identically whether or not the account exists, so
      // the confirmation here must stay just as non-committal.
      setForgotSent(true);
    } catch (err) {
      setError({
        message: err instanceof Error && err.message ? err.message : "Could not send reset link. Please try again.",
        suggestSignUp: false,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const errorBanner = error && (
    <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 p-3">
      <p className="text-sm text-red-800">
        {error.message}
        {error.suggestSignUp && (
          <>
            {" "}New here?{" "}
            <Link href={signUpHref} className="font-semibold underline underline-offset-4">
              Sign up
            </Link>
          </>
        )}
      </p>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow">
        {view === "forgot" ? (
          <>
            <h1 className="mb-2 text-2xl font-bold text-center">Reset your password</h1>
            <p className="mb-6 text-sm text-muted-foreground text-center">
              We&apos;ll email you a link to choose a new one.
            </p>
            {errorBanner}

            {forgotSent ? (
              <div className="space-y-5">
                <div className="flex flex-col items-center gap-3 py-2 text-center">
                  <span
                    aria-hidden
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-primary"
                  >
                    <MailCheck className="h-5 w-5" />
                  </span>
                  <p className="text-sm text-muted-foreground">
                    If an account exists for{" "}
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
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Sending…" : "Send reset link"}
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={() => { setError(null); showLogin(); }}>
                  <ArrowLeft className="mr-1" />
                  Back to log in
                </Button>
              </form>
            )}
          </>
        ) : (
          <>
            <h1 className="mb-2 text-2xl font-bold text-center">Log in</h1>
            <p className="mb-6 text-sm text-muted-foreground text-center">
              Welcome back to Bill Tracker.
            </p>
            {errorBanner}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="identifier">Email or username</Label>
                <Input
                  id="identifier"
                  type="text"
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  aria-invalid={error?.suggestSignUp || undefined}
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
                    onClick={() => { setError(null); setView("forgot"); }}
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
                  aria-invalid={error?.suggestSignUp || undefined}
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Logging in…" : "Log in"}
              </Button>
            </form>

            <div className="relative my-4">
              <div aria-hidden className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white px-2 text-xs uppercase tracking-wide text-muted-foreground">
                  or
                </span>
              </div>
            </div>

            <GoogleSignInButton returnTo={next} />
          </>
        )}
      </div>

      {/* Below the card, not inside it: a first-time visitor should spot the way
          to sign up before they start filling in the login form. */}
      <p className="text-sm text-muted-foreground">
        New to Bill Tracker?{" "}
        <Link href={signUpHref} className="font-medium text-primary underline-offset-4 hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}

// useSearchParams() requires a Suspense boundary during prerender (Next 15),
// so the form (which reads the ?next= param) is wrapped here at the page level.
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50" />
      }
    >
      <LoginForm />
    </Suspense>
  );
}
