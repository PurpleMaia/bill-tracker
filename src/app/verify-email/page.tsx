'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');

    if (!token) {
      setStatus('error');
      setMessage('Invalid verification link. No token provided.');
      return;
    }

    // Verify email
    fetch(`/api/auth/verify-email?token=${token}`)
      .then(async (response) => {
        const data = await response.json();
        if (response.ok && data.success) {
          setStatus('success');
          setMessage(data.message || 'Email verified successfully! Your account is now pending admin approval.');
        } else {
          setStatus('error');
          setMessage(data.error || 'Failed to verify email. The link may be invalid or expired.');
        }
      })
      .catch((error) => {
        console.error('Verification error:', error);
        setStatus('error');
        setMessage('An error occurred while verifying your email. Please try again.');
      });
  }, [searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Email Verification</CardTitle>
          <CardDescription>
            {status === 'loading' && 'Verifying your email address...'}
            {status === 'success' && 'Verification Complete'}
            {status === 'error' && 'Verification Failed'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === 'loading' && (
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
              <p className="mt-4 text-sm text-muted-foreground">Please wait...</p>
            </div>
          )}

          {status === 'success' && (
            <div className="space-y-4">
              <div className="text-center text-green-600">
                <svg
                  className="mx-auto h-12 w-12"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <p className="text-center text-sm">{message}</p>
              <Button
                onClick={() => router.push('/login')}
                className="w-full"
              >
                Go to Login
              </Button>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4">
              <div className="text-center text-red-600">
                <svg
                  className="mx-auto h-12 w-12"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <p className="text-center text-sm text-red-600">{message}</p>
              <Button
                onClick={() => router.push('/register')}
                variant="outline"
                className="w-full"
              >
                Back to Registration
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="p-6">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
              <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}

