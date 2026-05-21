'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

export function RegisterDialog() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [createOrg, setCreateOrg] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const { register } = useAuth();
  const { toast } = useToast();

  // Invite token state
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteOrgName, setInviteOrgName] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Check for invite token in URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('invite');
    if (!token) return;

    setInviteToken(token);
    setIsOpen(true);

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
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await register(
        email,
        username,
        password,
        inviteToken ? undefined : (createOrg ? orgName.trim() : undefined),
        inviteToken || undefined
      );
      if (result.success) {
        toast({
          title: 'Welcome!',
          description: inviteOrgName
            ? `Account created. You've joined ${inviteOrgName}.`
            : createOrg
              ? `Account and org "${orgName.trim()}" created.`
              : 'Your account has been created.',
        });
        setIsOpen(false);
        // Clean up invite param from URL
        if (inviteToken) {
          window.history.replaceState({}, '', window.location.pathname);
        }
      } else {
        toast({
          title: 'Registration failed',
          description: result.error || 'Please try again.',
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

  const isInviteFlow = !!inviteToken;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Register</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Register</DialogTitle>
        </DialogHeader>

        {/* Invite context banner */}
        {isInviteFlow && inviteOrgName && (
          <div className="rounded-md bg-blue-50 border border-blue-200 p-3">
            <p className="text-sm text-blue-800">
              You&apos;ve been invited to join <strong>{inviteOrgName}</strong>
            </p>
          </div>
        )}

        {/* Invite error banner */}
        {isInviteFlow && inviteError && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3">
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
              placeholder="Enter your email"
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
              placeholder="Enter your password"
              required
            />
          </div>

          {/* Hide create-org section when registering via invite */}
          {!isInviteFlow && (
            <div className="border-t pt-3 mt-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="dialog-create-org" className="text-sm font-medium cursor-pointer">
                    Create an organization
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Start a new org and become its admin
                  </p>
                </div>
                <Switch
                  id="dialog-create-org"
                  checked={createOrg}
                  onCheckedChange={setCreateOrg}
                />
              </div>

              {createOrg && (
                <div className="space-y-2">
                  <Label htmlFor="dialog-org-name">Organization Name</Label>
                  <Input
                    id="dialog-org-name"
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
              ? 'Creating account...'
              : isInviteFlow
                ? `Register & Join ${inviteOrgName || 'Organization'}`
                : createOrg
                  ? 'Register & Create Org'
                  : 'Register'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
