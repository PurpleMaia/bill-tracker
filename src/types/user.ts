import type { SystemRole, Membership } from './tenant';

export interface User {
  id: string;
  email: string;
  username: string;
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
