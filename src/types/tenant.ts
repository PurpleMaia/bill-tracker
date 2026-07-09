export type SystemRole = 'sysadmin' | 'user';
export type OrgRole = 'admin' | 'worker';

export interface Membership {
  tenantId: string;
  slug: string;
  name: string;
  orgRole: OrgRole;
}

export interface ActiveTenant {
  tenantId: string;
  slug: string;
  name: string;
  orgRole: OrgRole;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  createdAt: Date | string;
  brandingConfig: Record<string, unknown> | null;
}

export interface PublicOrg {
  tenantId: string;
  name: string;
  slug: string;
  description: string;
  isFollowing: boolean;
  followerCount: number;
  billCount: number;
}
