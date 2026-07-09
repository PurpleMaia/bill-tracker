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

export interface OrgSampleBill {
  id: string;
  billNumber: string | null;
  billTitle: string | null;
}

export interface PublicOrg {
  tenantId: string;
  name: string;
  slug: string;
  description: string;
  isFollowing: boolean;
  followerCount: number;
  billCount: number;
  /** Up to 3 most-recently-updated bills this org tracks, for the Browse card preview. */
  sampleBills: OrgSampleBill[];
}
