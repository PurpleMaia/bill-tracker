import { describe, it, expect } from 'vitest';
import { escapeCsvField, billsToCsv, billsToRows } from '../bills/bills-csv';
import type { Bill } from '@/types/legislation';

function makeBill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 'id-1',
    bill_number: 'HB1',
    bill_title: 'A Bill',
    nickname: null,
    bill_url: 'https://example.com/hb1',
    year: 2025,
    current_bill_status: 'introduced',
    current_status_string: 'Introduced',
    description: 'A description',
    archived: false,
    dead: false,
    committee_assignment: 'AGR',
    introducer: 'Rep. Smith',
    latest_update: null,
    ...overrides,
  };
}

const HEADER =
  '"Bill Number","Bill Title","Introducers","Committee Assignment","Current Status","Description","Bill URL","Archived"';

describe('escapeCsvField', () => {
  it('returns empty quoted string for null/undefined', () => {
    expect(escapeCsvField(null)).toBe('""');
    expect(escapeCsvField(undefined)).toBe('""');
  });

  it('quotes plain strings', () => {
    expect(escapeCsvField('hello')).toBe('"hello"');
  });

  it('escapes embedded double quotes by doubling them', () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });

  it('preserves commas and newlines inside the quoted field', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"');
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
  });

  it('renders booleans as true/false', () => {
    expect(escapeCsvField(true)).toBe('"true"');
    expect(escapeCsvField(false)).toBe('"false"');
  });
});

describe('billsToCsv', () => {
  it('emits the correct header in order with no Food Related column', () => {
    const csv = billsToCsv([]);
    expect(csv).toBe(HEADER);
    expect(csv).not.toContain('Food Related');
  });

  it('joins rows with CRLF in the defined column order', () => {
    const csv = billsToCsv([makeBill()]);
    const [header, row] = csv.split('\r\n');
    expect(header).toBe(HEADER);
    expect(row).toBe(
      '"HB1","A Bill","Rep. Smith","AGR","Introduced","A description","https://example.com/hb1","false"'
    );
  });

  it('escapes fields containing commas, quotes, and newlines', () => {
    const csv = billsToCsv([
      makeBill({
        bill_title: 'Relating to "Food", Land',
        description: 'Line 1\nLine 2',
      }),
    ]);
    const row = csv.split('\r\n')[1];
    expect(row).toContain('"Relating to ""Food"", Land"');
    expect(row).toContain('"Line 1\nLine 2"');
  });

  it('renders archived boolean as true and empties null fields', () => {
    const csv = billsToCsv([
      makeBill({ archived: true, committee_assignment: null }),
    ]);
    const row = csv.split('\r\n')[1];
    // committee_assignment (4th column) is empty, archived (last) is true
    expect(row).toBe(
      '"HB1","A Bill","Rep. Smith","","Introduced","A description","https://example.com/hb1","true"'
    );
  });

  it('returns only the header row for an empty list', () => {
    expect(billsToCsv([])).toBe(HEADER);
  });
});

describe('billsToRows', () => {
  const HEADER_ROW = [
    'Bill Number',
    'Bill Title',
    'Introducers',
    'Committee Assignment',
    'Current Status',
    'Description',
    'Bill URL',
    'Archived',
  ];

  it('returns the header row in order with no Food Related column', () => {
    const rows = billsToRows([]);
    expect(rows).toEqual([HEADER_ROW]);
    expect(rows[0]).not.toContain('Food Related');
  });

  it('maps bill fields into a row in the defined column order', () => {
    const rows = billsToRows([makeBill()]);
    expect(rows[1]).toEqual([
      'HB1',
      'A Bill',
      'Rep. Smith',
      'AGR',
      'Introduced',
      'A description',
      'https://example.com/hb1',
      false,
    ]);
  });

  it('preserves boolean and string cell types and empties null fields', () => {
    const rows = billsToRows([
      makeBill({ archived: true, committee_assignment: null }),
    ]);
    const row = rows[1];
    expect(row[3]).toBe(''); // committee_assignment null -> empty string
    expect(row[7]).toBe(true); // archived stays a real boolean
    expect(typeof row[0]).toBe('string');
  });
});
