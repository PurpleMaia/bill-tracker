'use client';

import Link from 'next/link';
import { KanbanSquareIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginDialog } from './login-dialog';

interface LoginWallProps {
  /** Headline for the card. Defaults to the "start tracking" invitation. */
  title?: string;
  /** Supporting copy under the headline. */
  description?: string;
  /** Where the primary CTA sends the visitor to start tracking bills. */
  ctaHref?: string;
  /** Label for the primary CTA. */
  ctaLabel?: string;
}

export function LoginWall({
  title = 'Start tracking a bill',
  description = 'You’re not tracking any bills yet. Search the Hawaii legislature and track bills to build your board.',
  ctaHref = '/search',
  ctaLabel = 'Start tracking a bill',
}: LoginWallProps = {}) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <KanbanSquareIcon className="mx-auto h-10 w-10 text-muted-foreground" />
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <Button asChild className="w-full sm:w-auto">
            <Link href={ctaHref}>{ctaLabel}</Link>
          </Button>
          {/* Signing in is still available — the dialog carries the route to
              registration, so the wall needs only the one trigger. */}
          <p className="text-sm text-muted-foreground">
            Already have an account? <LoginDialog trigger={<button type="button" className="font-medium text-primary underline-offset-4 hover:underline">Log in</button>} />
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
