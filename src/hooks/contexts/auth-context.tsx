'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { User } from '@/types/user';
import type { Membership, ActiveTenant } from '@/types/tenant';
import { data as dataClient } from '@/lib/data-client';
import type { UserPreferences } from '@/types/preferences';
import { UNRESOLVED_AUTH, type InitialAuth } from '@/lib/auth/initial-auth-types';

interface AuthContextType {
  user: User | null;
  loading: boolean;

  // Tenant state
  activeTenant: ActiveTenant | null;
  memberships: Membership[];
  isPublicUser: boolean;
  setActiveTenant: (tenantId: string) => void;

  // Auth actions
  login: (authString: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  register: (email: string, username: string, password: string, orgName?: string, inviteToken?: string) => Promise<{ success: boolean; error?: string }>;
  checkSession: () => Promise<void>;

  // User preferences
  preferences: UserPreferences | null;
  updatePreferences: (patch: Partial<UserPreferences>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ACTIVE_TENANT_KEY = 'activeTenantId';

export function AuthProvider({
  children,
  initialAuth = UNRESOLVED_AUTH,
}: {
  children: React.ReactNode;
  initialAuth?: InitialAuth;
}) {
  // Seed from the server's answer so the first client render is already
  // correct. When the server resolved the session there is nothing to wait
  // for, so `loading` starts false and no spinner is ever shown.
  const [user, setUser] = useState<User | null>(initialAuth.user);
  const [loading, setLoading] = useState(!initialAuth.resolved);
  const [memberships, setMemberships] = useState<Membership[]>(initialAuth.memberships);
  const [activeTenant, setActiveTenantState] = useState<ActiveTenant | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(initialAuth.preferences);

  const isPublicUser = user !== null && memberships.length === 0;

  const selectTenant = useCallback((tenantId: string, membershipList: Membership[]) => {
    const membership = membershipList.find(m => m.tenantId === tenantId);
    if (membership) {
      setActiveTenantState({
        tenantId: membership.tenantId,
        slug: membership.slug,
        name: membership.name,
        orgRole: membership.orgRole,
      });
      localStorage.setItem(ACTIVE_TENANT_KEY, tenantId);
    }
  }, []);

  const setActiveTenant = useCallback((tenantId: string) => {
    selectTenant(tenantId, memberships);
  }, [memberships, selectTenant]);

  const initializeTenant = useCallback((membershipList: Membership[]) => {
    if (membershipList.length === 0) {
      setActiveTenantState(null);
      localStorage.removeItem(ACTIVE_TENANT_KEY);
      return;
    }

    // Try to restore from localStorage
    const storedId = localStorage.getItem(ACTIVE_TENANT_KEY);
    if (storedId && membershipList.some(m => m.tenantId === storedId)) {
      selectTenant(storedId, membershipList);
    } else {
      // Auto-select first membership
      selectTenant(membershipList[0].tenantId, membershipList);
    }
  }, [selectTenant]);

  const checkSession = useCallback(async () => {
    try {
      // Preferences only need a session cookie, not the session RESPONSE, so
      // both requests go out together. Awaiting preferences inside the session
      // check serialised two independent round trips.
      const prefsPromise = dataClient.preferences.get().catch((e) => {
        console.error('Failed to load preferences:', e);
        return null;
      });

      const response = await fetch('/api/auth/session');
      if (response.ok) {
        const data = await response.json();
        if (data.user) {
          setUser(data.user);
          const membershipList: Membership[] = data.memberships ?? [];
          setMemberships(membershipList);
          initializeTenant(membershipList);
          setPreferences(await prefsPromise);
        } else {
          setUser(null);
          setMemberships([]);
          setActiveTenantState(null);
          setPreferences(null);
        }
      } else {
        setUser(null);
        setMemberships([]);
        setActiveTenantState(null);
        setPreferences(null);
      }
    } catch (error) {
      console.error('Session check error:', error);
      setUser(null);
      setMemberships([]);
      setActiveTenantState(null);
      setPreferences(null);
    } finally {
      setLoading(false);
    }
  }, [initializeTenant]);

  useEffect(() => {
    // The server already told us who the user is — re-fetching would only
    // repeat work and re-introduce the loading flash this change removes.
    // Still pick the active tenant here: that reads localStorage, which does
    // not exist during SSR, so it can only happen on the client.
    if (initialAuth.resolved) {
      if (initialAuth.memberships.length > 0) initializeTenant(initialAuth.memberships);
      return;
    }
    checkSession();
    // Deliberately keyed on the server's answer, not on checkSession: this is a
    // one-time bootstrap, and re-running it on every identity change of
    // checkSession would defeat the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAuth.resolved]);

  const login = async (authString: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authString, password }),
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        const membershipList: Membership[] = data.memberships ?? [];
        setMemberships(membershipList);
        initializeTenant(membershipList);
        try {
          const prefs = await dataClient.preferences.get();
          setPreferences(prefs);
        } catch (e) {
          console.error('Failed to load preferences:', e);
          setPreferences(null);
        }
        return { success: true };
      } else {
        const errorData = await response.json();
        const errorMsg = typeof errorData.error === 'string'
          ? errorData.error
          : 'Login failed. Please check your credentials.';
        return { success: false, error: errorMsg };
      }
    } catch (error) {
      return { success: false, error: 'Login error' };
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
      setMemberships([]);
      setActiveTenantState(null);
      setPreferences(null);
      localStorage.removeItem(ACTIVE_TENANT_KEY);
      window.location.href = '/';
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const register = async (email: string, username: string, password: string, orgName?: string, inviteToken?: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          username,
          password,
          orgName: orgName || undefined,
          inviteToken: inviteToken || undefined,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Auto-login: set user + memberships from register response
        if (data.user) {
          setUser(data.user);
          const membershipList: Membership[] = data.memberships ?? [];
          setMemberships(membershipList);
          initializeTenant(membershipList);
          try {
            const prefs = await dataClient.preferences.get();
            setPreferences(prefs);
          } catch (e) {
            console.error('Failed to load preferences:', e);
            setPreferences(null);
          }
        }
        return { success: true };
      } else {
        const errorData = await response.json();
        const errorMsg = typeof errorData.error === 'string'
          ? errorData.error
          : 'Registration failed. Please try again.';
        return { success: false, error: errorMsg };
      }
    } catch (error) {
      console.error('Registration error:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  };

  const updatePreferences = useCallback(async (patch: Partial<UserPreferences>) => {
    const updated = await dataClient.preferences.update(patch);
    setPreferences(updated);
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      activeTenant,
      memberships,
      isPublicUser,
      setActiveTenant,
      login,
      logout,
      register,
      checkSession,
      preferences,
      updatePreferences,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
