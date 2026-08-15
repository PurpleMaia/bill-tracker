import type { KANBAN_COLUMNS } from '@/lib/bills/kanban-columns';
import type { SearchFilters } from '@/lib/bills/search-params';
import { Timestamp } from '../db/types';

// Extract column IDs as possible statuses
export type BillStatus = (typeof KANBAN_COLUMNS)[number]['id'];

/**
 * Represents an introducer of a bill.
 */
export interface Introducer {
  name: string;
  /** URL to the introducer's picture. */
  imageUrl?: string;
}

/**
 * A specific draft version of a bill (e.g. HB139, HB139_HD1, HB139_SD1).
 * Backed by the bill_versions table.
 */
export interface BillVersion {
  id: string;
  label: string;
  htmlLink: string | null;
  pdfLink: string | null;
  originalText: string | null;
  aiSummary: string | null;
  createdAt: string | null;
  /** When the stored AI summary was generated; null if never summarized. */
  summaryGeneratedAt: string | null;
}

/**
 * A committee report on a bill (e.g. HSCR65, SSCR1197).
 * Backed by the committee_reports table. The label embeds the version it
 * belongs to, e.g. "HB139_HD1_HSCR65" belongs to the "HB139_HD1" version.
 */
export interface CommitteeReport {
  id: string;
  label: string;
  reportCode: string | null;
  htmlLink: string | null;
  pdfLink: string | null;
  originalText: string | null;
  aiSummary: string | null;
  createdAt: string | null;
  /** When the stored AI summary was generated; null if never summarized. */
  summaryGeneratedAt: string | null;
}

/**
 * Represents a news article related to the bill.
 */
export interface NewsArticle {
  title: string;
  url: string;
  source: string; // e.g., "Honolulu Star-Advertiser"
  date: Date;
}


/**
 * Represents a bill in the legislative process.
 */
export interface Bill {
  // attributes from the database
  id: string;
  bill_number: string;
  bill_title: string;
  nickname: string | null;
  bill_url: string;
  year: number | null;
  current_bill_status: string;
  current_status_string: string;
  description: string;
  archived: boolean;
  dead: boolean;
  committee_assignment: string | null;
  introducer?: string;

  // client side attributes
  latest_update: StatusUpdate | null;
  previous_status?: BillStatus;

  // LLM state 
  llm_suggested?: boolean;
  llm_processing?: boolean;
  tags?: Tag[];
  tracked_count?: number;
  tracked_by?: BillTracker[];
}

export interface BillDetails extends Bill {
  committee_assignment: string;
  introducer: string;
  food_related: boolean | null;
  created_at: Date | null;
  updated_at: Date | null;

  updates: StatusUpdate[];
  versions: BillVersion[];
  reports: CommitteeReport[];
}

export interface BillTracker {
  id: string;
  email: string | null;
  username: string | null;
  adopted_at?: Date | string | null;
}

export interface TempBill {
  id: string;
  bill_id?: string;
  bill_number?: string | null;
  bill_title: string | null;
  current_status: BillStatus;
  proposed_status: BillStatus;
  target_idx: number;
  source?: 'llm' | 'human';
  approval_status?: 'pending' | 'approved' | 'rejected';
  proposed_by?: {
    user_id: string;
    role: 'intern' | 'supervisor' | 'admin' | 'worker';
    at: string;      // ISO timestamp
    note?: string;
    username?: string;
    email?: string;
  };
};

export interface StatusUpdate {
  chamber: string;
  date: string;
  id: string;
  statustext: string
}

/**
 * Represents a tag that can be applied to bills.
 */
export interface Tag {
  id: string;
  name: string;
  color?: string | null;
  tenant_id: string;
  created_at?: Date | string;
  updated_at?: Date | string;
}

/**
 * Params for a version-to-version diff request. Declared here rather than in
 * actions/bills.ts because a 'use server' file may only export async functions.
 */
export interface CompareVersionsParams {
  billId: string;
  olderId: string;
  newerId: string;
}

/** A generated AI summary plus the model that produced it. */
export interface SummaryResult {
  summary: string;
  model: string;
}

/**
 * Lean projection for the /search page. Deliberately excludes tags, status
 * updates, and versions: getAdditionalBillData() issues extra queries per bill
 * set and search cards display none of it.
 */
export interface BillSearchResult {
  id: string;
  bill_number: string;
  bill_title: string;
  description: string;
  year: number | null;
  bill_status: string | null;
  dead: boolean;
  bill_url: string;
  updated_at: string | null;
}

export interface BillSearchResponse {
  items: BillSearchResult[];
  nextCursor: string | null;
  totalCount: number;
}

/**
 * Params for searchBills(). Declared here rather than in db/queries/bills-read.ts
 * because that file is 'use server' and may only export async functions.
 */
export interface SearchBillsParams extends SearchFilters {
  cursor?: string | null;
  limit?: number;
}
