import type { KANBAN_COLUMNS } from '@/lib/kanban-columns';
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
 * Represents a specific draft version of a bill.
 */
export interface BillDraft {
  version: string; // e.g., "HD1", "SD2", "Final"
  htmlUrl: string;
  pdfUrl: string;
  date: Date; // Date this draft was published
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
  bill_url: string;
  year: number | null;
  current_bill_status: string;
  current_status_string: string;
  description: string;
  archived: boolean;
  dead: boolean;
  committee_assignment: string | null;

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
    role: 'intern' | 'supervisor' | 'admin';
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
  created_at?: Date | string;
  updated_at?: Date | string;
}
