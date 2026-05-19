"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [createOrg, setCreateOrg] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { register } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const result = await register(
        email,
        username,
        password,
        createOrg ? orgName.trim() : undefined
      );
      if (result.success) {
        toast({
          title: "Welcome!",
          description: createOrg
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

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Creating account..." : createOrg ? "Register & Create Org" : "Register"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <a href="/" className="text-primary underline-offset-4 hover:underline">
            Log in
          </a>
        </p>
      </div>
    </div>
  );
}
