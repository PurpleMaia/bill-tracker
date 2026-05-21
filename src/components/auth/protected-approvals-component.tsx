'use client';

import { useAuth } from '@/hooks/contexts/auth-context';
import { ReactNode } from 'react';

interface ProtectedApprovalsComponentProps {
  children: ReactNode;
}

export function ProtectedApprovalsComponent({ children }: ProtectedApprovalsComponentProps) {
  const { user, activeTenant, loading } = useAuth();

  if (loading) {
    return null;
  }

  // Only show for org admins
  if (!user || activeTenant?.orgRole !== 'admin') {
    return null;
  }

  return <>{children}</>;
}
