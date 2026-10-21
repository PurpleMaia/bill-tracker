import fs from 'fs';
import path from 'path';
import { PDFParse } from 'pdf-parse';

interface ParsedDeadlines {
  session: number;
  deadlines: Record<string, string | { HB: string; SB: string }>;
}

const MONTH_MAP: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04',
  MAY: '05', JUN: '06', JUL: '07', AUG: '08',
  SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};

function parseDate(month: string, day: string, year: number): string {
  const mm = MONTH_MAP[month.toUpperCase()];
  const dd = day.padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

async function main() {
  const pdfPath = process.argv[2];
  const sessionYear = parseInt(process.argv[3] || '2026', 10);

  if (!pdfPath) {
    console.error('Usage: tsx scripts/parse-session-calendar.ts <path-to-pdf> [session-year]');
    process.exit(1);
  }

  const dataBuffer = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: new Uint8Array(dataBuffer) });
  const data = await parser.getText();
  const text = data.text;
  await parser.destroy();

  const result: ParsedDeadlines = {
    session: sessionYear,
    deadlines: {},
  };

  // Pattern: "FEB 11 (HOUSE BILLS) & FEB 12 (SENATE BILLS) FIRST TRIPLE REFERRAL FILING"
  const tripleFirstMatch = text.match(
    /(\w{3})\s+(\d{1,2})\s*\(HOUSE BILLS?\)\s*&\s*(\w{3})\s+(\d{1,2})\s*\(SENATE BILLS?\)\s*FIRST TRIPLE REFERRAL FILING/i
  );
  if (tripleFirstMatch) {
    result.deadlines.first_triple_referral_filing = {
      HB: parseDate(tripleFirstMatch[1], tripleFirstMatch[2], sessionYear),
      SB: parseDate(tripleFirstMatch[3], tripleFirstMatch[4], sessionYear),
    };
  }

  // Pattern: "FEB 19 FIRST LATERAL FILING"
  const firstLateralFilingMatch = text.match(
    /(\w{3})\s+(\d{1,2})\s*FIRST LATERAL FILING/i
  );
  if (firstLateralFilingMatch) {
    result.deadlines.first_lateral_filing = parseDate(
      firstLateralFilingMatch[1], firstLateralFilingMatch[2], sessionYear
    );
  }

  // Pattern: "FEB 20 FIRST LATERAL (BILLS)"
  const firstLateralMatch = text.match(
    /(\w{3})\s+(\d{1,2})\s*FIRST LATERAL\s*\(BILLS\)/i
  );
  if (firstLateralMatch) {
    result.deadlines.first_lateral = parseDate(
      firstLateralMatch[1], firstLateralMatch[2], sessionYear
    );
  }

  // Pattern: "MAR 5 SINGLE REFERRAL FILING DEADLINE (SBS)"
  const singleSBMatch = text.match(
    /(\w{3})\s+(\d{1,2})\s*SINGLE REFERRAL FILING DEADLINE\s*\(SBS?\)/i
  );
  // Pattern: "APR 9 ... & SINGLE REFERRAL FILING DEADLINE (HBS)"
  // The HB deadline shares its date with the preceding entry (e.g., "APR 9 FIRST CROSSOVER ...
  // & SINGLE REFERRAL FILING DEADLINE (HBS)"). We find the date by looking for the nearest
  // "MONTH DAY" immediately before the block containing "SINGLE REFERRAL FILING DEADLINE (HBS)".
  const singleHBMatch = text.match(
    /(\w{3})\s+(\d{1,2})\s+(?:(?!(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+\d)[\s\S])*?SINGLE REFERRAL FILING DEADLINE\s*\(HBS?\)/i
  );
  if (singleSBMatch || singleHBMatch) {
    result.deadlines.single_referral_filing = {
      SB: singleSBMatch ? parseDate(singleSBMatch[1], singleSBMatch[2], sessionYear) : '',
      HB: singleHBMatch ? parseDate(singleHBMatch[1], singleHBMatch[2], sessionYear) : '',
    };
  }

  // Pattern: "MAR 6 FIRST DECKING"
  const firstDeckingMatch = text.match(
    /(\w{3})\s+(\d{1,2})\s*FIRST DECKING/i
  );
  if (firstDeckingMatch) {
    result.deadlines.first_decking = parseDate(
      firstDeckingMatch[1], firstDeckingMatch[2], sessionYear
    );
  }

  // Pattern: "MAR 12 FIRST CROSSOVER"
  const firstCrossoverMatch = text.match(
    /(\w{3})\s+(\d{1,2})\s*FIRST CROSSOVER\s*\(BILLS\)/i
  );
  if (firstCrossoverMatch) {
    result.deadlines.first_crossover = parseDate(
      firstCrossoverMatch[1], firstCrossoverMatch[2], sessionYear
    );
  }

  // Pattern: "MAR 19 SECOND TRIPLE REFERRAL FILING"
  const secondTripleMatch = text.match(
    /(\w{3})\s+(\d{1,2})\s*SECOND TRIPLE REFERRAL FILING/i
  );
  if (secondTripleMatch) {
    result.deadlines.second_triple_referral_filing = parseDate(
      secondTripleMatch[1], secondTripleMatch[2], sessionYear
    );
  }

  // Pattern: "MAR 27 SECOND LATERAL FILING"
  const secondLateralFilingMatch = text.match(
    /(\w{3})\s+(\d{1,2})\s*SECOND LATERAL FILING/i
  );
  if (secondLateralFilingMatch) {
    result.deadlines.second_lateral_filing = parseDate(
      secondLateralFilingMatch[1], secondLateralFilingMatch[2], sessionYear
    );
  }

  // Pattern: "MAR 30 SECOND LATERAL (BILLS)"
  const secondLateralMatch = text.match(
    /(\w{3})\s+(\d{1,2})\s*SECOND LATERAL\s*\(BILLS\)/i
  );
  if (secondLateralMatch) {
    result.deadlines.second_lateral = parseDate(
      secondLateralMatch[1], secondLateralMatch[2], sessionYear
    );
  }

  // Pattern: "APR 10 SECOND DECKING"
  const secondDeckingMatch = text.match(
    /(\w{3})\s+(\d{1,2})\s*SECOND DECKING/i
  );
  if (secondDeckingMatch) {
    result.deadlines.second_decking = parseDate(
      secondDeckingMatch[1], secondDeckingMatch[2], sessionYear
    );
  }

  // Pattern: "APR 16 SECOND CROSSOVER"
  const secondCrossoverMatch = text.match(
    /(\w{3})\s+(\d{1,2})\s*SECOND CROSSOVER\s*\(BILLS\)/i
  );
  if (secondCrossoverMatch) {
    result.deadlines.second_crossover = parseDate(
      secondCrossoverMatch[1], secondCrossoverMatch[2], sessionYear
    );
  }

  // Output
  const outputPath = path.resolve(__dirname, `../src/data/session-deadlines-${sessionYear}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');

  console.log(`Parsed ${Object.keys(result.deadlines).length} deadlines:`);
  for (const [key, value] of Object.entries(result.deadlines)) {
    if (typeof value === 'string') {
      console.log(`  ${key}: ${value}`);
    } else {
      console.log(`  ${key}: HB=${value.HB}, SB=${value.SB}`);
    }
  }
  console.log(`\nWritten to: ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
