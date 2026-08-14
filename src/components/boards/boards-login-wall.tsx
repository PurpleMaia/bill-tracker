'use client';

import Link from 'next/link';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginDialog } from '@/components/auth/login-dialog';

/**
 * Gate for the View Board tab. Mirrors LoginWall, but sends visitors to
 * /boards/browse — the organization list stays public, only the boards
 * themselves require an account.
 */
export function BoardsLoginWall() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <Lock className="mx-auto h-10 w-10 text-muted-foreground" />
          <CardTitle>Login to view active boards</CardTitle>
          <CardDescription>
            Boards you follow appear here once you log in. You can still browse every public
            organization without an account.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          <LoginDialog />
          <Button asChild variant="outline" size="sm">
            <Link href="/boards/browse">Browse organizations</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
