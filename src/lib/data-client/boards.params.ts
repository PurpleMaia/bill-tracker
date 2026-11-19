export interface GetBoardParams {
  tenantId: string;
  showArchived: boolean;
}

export interface FollowParams {
  tenantId: string;
}

export interface OrgTestimonyStatusParams {
  tenantId: string;
  billIds: string[];
}

export interface SetPublicBoardParams {
  tenantId: string;
  enabled: boolean;
}

export interface SetOrgDescriptionParams {
  tenantId: string;
  description: string;
}

export interface OrgSettingsParams {
  tenantId: string;
}

export interface MyOrgStatsParams {
  tenantId: string;
}

export interface MyOrgBoardParams {
  tenantId: string;
}

export interface PublicBoardParams {
  slug: string;
}
