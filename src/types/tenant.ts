import type { Bill } from '@/types/legislation';

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

/** The org shown on a public /community/<slug> board. */
export interface PublicBoardOrg {
  tenantId: string;
  name: string;
  slug: string;
  description: string;
}

/** Everything a public board page renders; identical for every viewer. */
export interface PublicBoard {
  org: PublicBoardOrg;
  bills: Bill[];
  testimonyBillIds: string[];
}

/** An admin's preview of their own org's board — shown even while private. */
export interface MyOrgBoard extends PublicBoard {
  publicBoard: boolean;
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

/**
 * The viewer's own org, for the "Your Organization" card. Like PublicOrg but
 * carries publicBoard (the card shows a public/private badge) and is returned
 * regardless of public visibility.
 */
export interface MyOrg extends PublicOrg {
  publicBoard: boolean;
}
