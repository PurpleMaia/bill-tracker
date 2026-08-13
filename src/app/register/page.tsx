"use client";

import { useState, useEffect, Suspense } from "react";
import { useAuth } from "@/hooks/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useRouter, useSearchParams } from "next/navigation";

function RegisterForm() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [createOrg, setCreateOrg] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { register } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Invite token state
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteOrgName, setInviteOrgName] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Check for invite token in URL on mount
  useEffect(() => {
    const token = searchParams.get('invite');
    if (!token) return;

    setInviteToken(token);

    fetch(`/api/invites/validate?token=${token}`)
      .then(res => res.json())
      .then(data => {
        if (data.valid) {
          setInviteOrgName(data.orgName);
          if (data.email) setEmail(data.email);
        } else {
          setInviteError(data.reason || 'This invite is no longer valid.');
        }
      })
      .catch(() => {
        setInviteError('Failed to validate invite. Please try again.');
      });
  }, [searchParams]);

  const isInviteFlow = !!inviteToken;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const result = await register(
        email,
        username,
        password,
        isInviteFlow ? undefined : (createOrg ? orgName.trim() : undefined),
        inviteToken || undefined
      );
      if (result.success) {
        toast({
          title: "Welcome!",
          description: inviteOrgName
            ? `Account created. You've joined ${inviteOrgName}.`
            : createOrg
              ? `Your account and organization "${orgName.trim()}" have been created.`
              : "Your account has been created.",
        });
        router.push("/");
      } else {
        toast({
          title: "Registration failed",
          description: result.error || "Please try again.",
          variant: "destructive",
        });
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
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow">
        <h1 className="mb-2 text-2xl font-bold text-center">Create an Account</h1>
        <p className="mb-6 text-sm text-muted-foreground text-center">
          Register to track bills and collaborate with your organization.
        </p>

        {/* Invite context banner */}
        {isInviteFlow && inviteOrgName && (
          <div className="rounded-md bg-blue-50 border border-blue-200 p-3 mb-4">
            <p className="text-sm text-blue-800">
              You&apos;ve been invited to join <strong>{inviteOrgName}</strong>
            </p>
          </div>
        )}

        {/* Invite error banner */}
        {isInviteFlow && inviteError && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 mb-4">
            <p className="text-sm text-red-800">{inviteError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="register-email">Email</Label>
            <Input
              id="register-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="register-username">Username</Label>
            <Input
              id="register-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Choose a username"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="register-password">Password</Label>
            <Input
              id="register-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Choose a password"
              required
            />
          </div>

          {/* Hide create-org section when registering via invite */}
          {!isInviteFlow && (
            <div className="border-t pt-4 mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="create-org" className="text-sm font-medium cursor-pointer">
                    Create an organization
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Start a new org and become its admin
                  </p>
                </div>
                <Switch
                  id="create-org"
                  checked={createOrg}
                  onCheckedChange={setCreateOrg}
                />
              </div>

              {createOrg && (
                <div className="space-y-2">
                  <Label htmlFor="org-name">Organization Name</Label>
                  <Input
                    id="org-name"
                    type="text"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="e.g. Food Policy Council"
                    required={createOrg}
                    maxLength={100}
                  />
                </div>
              )}
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={isLoading || (isInviteFlow && !!inviteError)}
          >
            {isLoading
              ? "Creating account..."
              : isInviteFlow
                ? `Register & Join ${inviteOrgName || 'Organization'}`
                : createOrg
                  ? "Register & Create Org"
                  : "Register"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <a href="/" className="text-primary underline-offset-4 hover:underline">
            Login
          </a>
        </p>
      </div>
    </div>
  );
}

// useSearchParams() requires a Suspense boundary during prerender (Next 15),
// so the form (which reads the ?invite= param) is wrapped here at the page level.
export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50" />
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
