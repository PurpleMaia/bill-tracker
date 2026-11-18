'use server';

import { requireAdmin, requireSession } from '@/lib/auth/auth-guards';
import { scrapeForUpdates, findBill } from '@/services/scraper';
import { classifyStatusWithLLM } from '@/services/llm';

// ==============================================
// SCRAPER / LLM — SERVER ACTIONS
// ==============================================
// Guarded wrappers over the external-integration services, which spend scraper
// and LLM capacity and so must not be callable anonymously.

/** "Refresh statuses" in the bill dialog — any signed-in user. */
export async function scrapeForUpdatesAction(billId: string) {
  await requireSession.fromAction();
  return scrapeForUpdates(billId);
}

/** Legacy "Manage Bills" dialog — looks up (and may insert) a bill by URL. Admin only. */
export async function findBillAction(params: { billUrl: string; tenantId?: string }) {
  await requireAdmin.fromAction(params.tenantId);
  return findBill(params.billUrl);
}

/** Column "AI update" button — any signed-in user. */
export async function classifyStatusAction(billId: string) {
  await requireSession.fromAction();
  return classifyStatusWithLLM(billId);
}
