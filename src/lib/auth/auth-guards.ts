// ==============================================
// AUTH GUARDS
// ==============================================
// One place for the auth/authorization preamble that API routes and server
// actions both need. Previously this logic was hand-rolled in ~15 routes
// (getSessionCookie -> validateSession -> validateMembership -> role check),
// duplicated again as verifyAdminAccess() in actions/admin.ts, and a third
// time (insecurely) as getAdminUserData() in lib/admin-utils.ts.
//
// Each guard exposes two entry points over one shared core:
//   - fromRequest(request, tenantId?) — for API routes (reads the cookie)
//   - fromAction(tenantId?)           — for server actions (uses auth())
//
// Guards throw an ApiError (from @/lib/errors) on failure; callers map that to
// an HTTP status (routes) or an ActionResult (actions). The four modes:
//   requireSession    — must be logged in
//   optionalSession   — resolves the user if present, else null (no throw)
//   requireMembership — logged in AND a member of tenantId (returns orgRole)
//   requireAdmin      — logged in AND org admin (tenant) or global admin (legacy)

import type { NextRequest } from 'next/server';
import type { User } from '@/types/user';
import type { OrgRole } from '@/db/types';
import { auth, validateSession } from '@/lib/auth/session';
import { getSessionCookie } from '@/lib/auth/cookies';
import { validateMembership } from '@/db/queries/tenants';
import { Errors } from '@/lib/core/errors';

export interface AuthContext {
  user: User;
  /** Present when the call was tenant-scoped. */
  orgRole?: OrgRole;
}

export interface OptionalAuthContext {
  user: User | null;
  orgRole?: OrgRole;
}

// ---- shared resolvers ----

async function userFromRequest(request: NextRequest): Promise<User> {
  return validateSession(getSessionCookie(request));
}

async function userFromAction(): Promise<User> {
  const session = await auth();
  if (!session) throw Errors.NO_SESSION_COOKIE;
  return session.user;
}

// ---- requireSession ----

export const requireSession = {
  async fromRequest(request: NextRequest): Promise<AuthContext> {
    return { user: await userFromRequest(request) };
  },
  async fromAction(): Promise<AuthContext> {
    return { user: await userFromAction() };
  },
};

// ---- optionalSession ----
// Never throws on a missing/invalid session — returns { user: null }. Used by
// endpoints with a public branch (e.g. the bills list).

export const optionalSession = {
  async fromRequest(request: NextRequest): Promise<OptionalAuthContext> {
    try {
      return { user: await userFromRequest(request) };
    } catch {
      return { user: null };
    }
  },
  async fromAction(): Promise<OptionalAuthContext> {
    const session = await auth();
    return { user: session?.user ?? null };
  },
};

// ---- requireMembership ----
// Logged in AND a member of the tenant. Returns the member's orgRole.

export const requireMembership = {
  async fromRequest(request: NextRequest, tenantId: string): Promise<Required<AuthContext>> {
    const user = await userFromRequest(request);
    const orgRole = await validateMembership(user.id, tenantId);
    return { user, orgRole };
  },
  async fromAction(tenantId: string): Promise<Required<AuthContext>> {
    const user = await userFromAction();
    const orgRole = await validateMembership(user.id, tenantId);
    return { user, orgRole };
  },
};

// ---- requireAdmin ----
// Org admin when tenant-scoped, else legacy global admin. Mirrors the old
// verifyAdminAccess() semantics exactly.

async function assertAdmin(user: User, tenantId?: string): Promise<AuthContext> {
  if (tenantId) {
    const orgRole = await validateMembership(user.id, tenantId);
    if (orgRole !== 'admin') throw Errors.UNAUTHORIZED;
    return { user, orgRole };
  }
  if (user.role !== 'admin') throw Errors.UNAUTHORIZED;
  return { user };
}

export const requireAdmin = {
  async fromRequest(request: NextRequest, tenantId?: string): Promise<AuthContext> {
    return assertAdmin(await userFromRequest(request), tenantId);
  },
  async fromAction(tenantId?: string): Promise<AuthContext> {
    return assertAdmin(await userFromAction(), tenantId);
  },
};
