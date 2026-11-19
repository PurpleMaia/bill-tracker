import type { ContactMethod, ContactStage } from '@/lib/legislators/contact-stage';

export type { ContactMethod, ContactStage };

/** One logged outreach to a legislator (or the Governor's office) about a bill. */
export interface LegislatorContact {
  id: string;
  billId: string;
  stage: ContactStage;
  /** Who was contacted, as shown on the contact page ("Rep. Jane Doe", "Governor's office"). */
  recipient: string;
  method: ContactMethod;
  note: string | null;
  /** ISO timestamp. */
  contactedAt: string;
  /** Display name of the user who logged it. */
  contactedBy: string;
  /** Logged by the current user (only these can be removed). */
  mine: boolean;
}

export interface LogContactsInput {
  billId: string;
  stage: ContactStage;
  /** One row is logged per recipient. */
  recipients: string[];
  method: ContactMethod;
  note?: string | null;
  /** The org the user acted for; teammates in it see the contact. */
  tenantId?: string;
}
