"use client";

import { useState, useEffect, Suspense } from "react";
import { useAuth } from "@/hooks/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, LinkIcon } from "lucide-react";

type Stage = "validating" | "invalid" | "form";

function ResetPasswordForm() {
  const [stage, setStage] = useState<Stage>("validating");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { checkSession } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  // Validate on load WITHOUT consuming the token, so a reload doesn't burn it.
  useEffect(() => {
    if (!token) {
      setStage("invalid");
      return;
    }

    let cancelled = false;
    fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        setStage(data.valid ? "form" : "invalid");
      })
      .catch(() => {
        if (!cancelled) setStage("invalid");
      });

    return () => { cancelled = true; };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure both fields are identical.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        // The route issued a fresh session cookie; pull it into auth state.
        await checkSession();
        toast({
          title: "Password updated",
          description: "You're now signed in with your new password.",
        });
        router.push("/");
      } else {
        toast({
          title: "Could not reset password",
          description: typeof data.error === "string" ? data.error : "Please try again.",
          variant: "destructive",
        });
        // A consumed or expired token can't be retried from this page.
        if (response.status === 400) setStage("invalid");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      {/* Mirrors the login dialog's brand band so the emailed link lands on a
          surface that reads as the same flow the user started. */}
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="flex items-center gap-3 border-b border-border bg-secondary/60 px-6 py-5">
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
          >
            {stage === "invalid" ? <LinkIcon className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            <h1 className="text-base font-semibold leading-tight">
              {stage === "invalid" ? "Link no longer valid" : "Set a new password"}
            </h1>
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
              {stage === "invalid"
                ? "Reset links last 1 hour and work only once."
                : "Choose a new password for your Food+ account."}
            </p>
          </div>
        </div>

        <div className="px-6 py-5">
        {stage === "validating" && (
          <p className="text-center text-sm text-muted-foreground">Checking your reset link…</p>
        )}

        {stage === "invalid" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This password reset link is invalid, has expired, or has already been used.
              Request a fresh one from the log in screen.
            </p>
            <Button className="w-full" onClick={() => router.push("/")}>
              Back to Food+
            </Button>
          </div>
        )}

        {stage === "form" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Choose a new password"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your new password"
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Updating password…" : "Reset password"}
              </Button>
            </form>
        )}
        </div>
      </div>
    </div>
  );
}

// useSearchParams() requires a Suspense boundary during prerender (Next 15),
// so the form (which reads the ?token= param) is wrapped here at the page level.
export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background" />
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
