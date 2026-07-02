'use client';

import { Lock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginDialog } from './login-dialog';

export function LoginWall() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <Lock className="mx-auto h-10 w-10 text-muted-foreground" />
          <CardTitle>Log in to view your bills</CardTitle>
          <CardDescription>
            Your tracked bills and kanban board are available once you sign in.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <LoginDialog />
        </CardContent>
      </Card>
    </div>
  );
}
