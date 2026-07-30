import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

import type { Bills } from '../../db/types';
import type { Bill } from '../../types/legislation';
import { KANBAN_COLUMNS } from "../bills/kanban-columns";

// Helper to safely convert Kysely Timestamp/Generated<Timestamp|null> to Date|null
export function toDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Human-friendly card headline for a bill: the curated nickname when present,
 * otherwise the official title cleaned up — "RELATING TO FARM-TO-SCHOOL
 * PROCUREMENT." → "Farm-To-School Procurement". Returns null when there is
 * nothing usable to show.
 */
export function formatBillHeadline(bill: { nickname?: string | null; bill_title?: string | null }): string | null {
  const nickname = bill.nickname?.trim();
  if (nickname) return nickname;

  const title = bill.bill_title?.trim();
  if (!title) return null;

  const cleaned = title.replace(/^relating to\b\s*/i, '').replace(/\.+$/, '').trim();
  if (!cleaned) return null;

  return cleaned.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Compact relative date for activity lines: "today", "yesterday", "4d ago",
 * "3w ago", then a short absolute date ("Mar 5", with year when it differs
 * from the current one). Returns '' for unparseable dates.
 */
export function formatRelativeDate(dateStr: string, now: Date = new Date()): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 35) return `${Math.floor(days / 7)}w ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

/**
 * Today's date (YYYY-MM-DD) in Hawaii Standard Time.
 *
 * `new Date().toISOString()` yields the UTC date, which rolls over to
 * "tomorrow" at 2:00 PM HST — making deadline math (urgency flags, next
 * deadline, dead-bill checks) up to a day early. All legislative deadlines
 * are Hawaii dates, so compare against Hawaii's today.
 */
export function todayHawaii(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD; Pacific/Honolulu has no DST.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Honolulu' }).format(now);
}

export function formatBillStatusName(status: string | null): string {
  if (!status) return 'No Assigned Status';
  const lowerStatus = status.toLowerCase();

  // Check for keywords and return formatted strings
  if (lowerStatus.includes('introduced')) return 'Introduced';
  if (lowerStatus.includes('waiting')) return 'Waiting';
  if (lowerStatus.includes('scheduled')) return 'Scheduled';
  if (lowerStatus.includes('deferred')) return 'Deferred';
  if (lowerStatus.includes('passed')) return 'Passed';
  if (lowerStatus.includes('unassigned')) return 'N/A';
  if (lowerStatus.includes('assigned')) return 'Assigned';
  if (lowerStatus.includes('transmitted')) return 'Transmitted';
  if (lowerStatus.includes('veto')) return 'Vetoed';
  if (lowerStatus.includes('signs') || lowerStatus.includes('law')) return 'Became Law';

  // Fallback to column title if available, or the status itself
  return KANBAN_COLUMNS.find(col => col.id === status)?.title || status;
}

// Permission helpers now live in @/lib/permissions.