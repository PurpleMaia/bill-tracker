'use client';

import { useAuth } from '@/hooks/contexts/auth-context';
import { ReactNode } from 'react';

interface ProtectedComponentProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function ProtectedComponent({ children, fallback = null }: ProtectedComponentProps) {
  const { user } = useAuth();

  if (!user) {
    return fallback;
  }  

  return <>{children}</>;
}

export function ProtectedAdminComponent({ children, fallback = null }: ProtectedComponentProps) {
  const { user, activeTenant } = useAuth();

  if (!user || activeTenant?.orgRole !== 'admin') {
    return fallback;
  }

  return <>{children}</>;
}
