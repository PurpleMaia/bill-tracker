import type { Bill } from '@/types/legislation';

export type ExportFormat = 'csv' | 'xlsx';

/**
 * Export columns for the bill export. Mirrors `scripts/export-csv.ts` minus the
 * `food_related` field. Order matters — it defines the column order in both the
 * CSV and the XLSX sheet.
 */
export const EXPORT_COLUMNS: { header: string; field: keyof Bill }[] = [
  { header: 'Bill Number', field: 'bill_number' },
  { header: 'Bill Title', field: 'bill_title' },
  { header: 'Introducers', field: 'introducer' },
  { header: 'Committee Assignment', field: 'committee_assignment' },
  { header: 'Current Status', field: 'current_status_string' },
  { header: 'Description', field: 'description' },
  { header: 'Bill URL', field: 'bill_url' },
  { header: 'Archived', field: 'archived' },
];

/**
 * Normalize a bill field to a primitive cell value. Null/undefined become an
 * empty string; everything else is passed through (booleans stay booleans so
 * the spreadsheet renders a real boolean cell).
 */
function cellValue(value: unknown): string | number | boolean {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return String(value);
}

/**
 * Coerce a value to a CSV-safe, double-quoted field. Null/undefined become an
 * empty quoted string, booleans become "true"/"false", and embedded double
 * quotes are escaped by doubling them (per RFC 4180).
 */
export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) {
    return '""';
  }
  const str = String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Build a CSV string from a list of bills. Rows are joined with CRLF and the
 * header row is always present, so an empty list yields just the header.
 */
export function billsToCsv(bills: Bill[]): string {
  const headerRow = EXPORT_COLUMNS.map((c) => escapeCsvField(c.header)).join(',');
  const dataRows = bills.map((bill) =>
    EXPORT_COLUMNS.map((c) => escapeCsvField(bill[c.field])).join(',')
  );
  return [headerRow, ...dataRows].join('\r\n');
}

/**
 * Build an array-of-arrays (header row + one row per bill) suitable for
 * `XLSX.utils.aoa_to_sheet`. Kept here, alongside the column definition, so the
 * CSV and XLSX exports never drift apart.
 */
export function billsToRows(bills: Bill[]): (string | number | boolean)[][] {
  const header = EXPORT_COLUMNS.map((c) => c.header);
  const rows = bills.map((bill) =>
    EXPORT_COLUMNS.map((c) => cellValue(bill[c.field]))
  );
  return [header, ...rows];
}
