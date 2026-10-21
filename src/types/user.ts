import type { SystemRole, Membership } from './tenant';

export interface User {
  id: string;
  email: string;
  username: string;
  /** Null for accounts created before names were collected. */
  firstName: string | null;
  lastName: string | null;
  systemRole: SystemRole;
  role: string; // deprecated, kept for backward compat during migration
}

export interface SessionUser extends User {
  memberships: Membership[];
}

export interface Session {
  id: string;
  userId: string;
  expiresAt: Date;
}
