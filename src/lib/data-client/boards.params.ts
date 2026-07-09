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
