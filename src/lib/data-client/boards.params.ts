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

export interface OrgSettingsParams {
  tenantId: string;
}
