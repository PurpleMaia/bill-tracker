// PDF generator (pdfmake). Imported dynamically from the export step.
// pdfmake's bundled VFS ships Roboto only; embedding other fonts is out of
// scope for v1, so the PDF normalizes all fonts to Roboto (the DOCX export
// preserves the chosen font families). Roboto is Unicode-safe, which matters
// for Hawaiian diacriticals (ʻokina/kahakō).

import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { TestimonyBlock, TestimonyMeta, TextRun } from './blocks';
import { composeHeaderLines } from './blocks';

const HEADING_SIZES = { 1: 18, 2: 15, 3: 13 } as const;

function pdfRuns(runs: TextRun[]): Content {
  if (runs.length === 0) return { text: ' ' }; // keep empty paragraphs as blank lines
  return {
    text: runs.map((run) => {
      if (run.break) {
        return { text: '\n' };
      }
      return {
        text: run.text,
        bold: run.bold,
        italics: run.italic,
        // pdfmake takes one decoration; underline wins if both are set.
        decoration: run.underline ? ('underline' as const) : run.strike ? ('lineThrough' as const) : undefined,
      };
    }),
  };
}

export async function generateTestimonyPdf(
  meta: TestimonyMeta,
  blocks: TestimonyBlock[],
): Promise<Blob> {
  const pdfMakeModule: any = await import('pdfmake/build/pdfmake');
  const pdfFontsModule: any = await import('pdfmake/build/vfs_fonts');
  const pdfMake = pdfMakeModule.default ?? pdfMakeModule;
  const pdfFonts = pdfFontsModule.default ?? pdfFontsModule;
  pdfMake.vfs = pdfFonts.pdfMake?.vfs ?? pdfFonts.vfs;

  const content: Content[] = [];

  composeHeaderLines(meta).forEach((line, index) => {
    content.push({ text: line, alignment: 'center', bold: index === 0, margin: [0, 0, 0, 2] });
  });
  content.push({ text: ' ', margin: [0, 0, 0, 8] });

  for (const block of blocks) {
    if (block.type === 'heading') {
      content.push({
        ...(pdfRuns(block.runs) as object),
        fontSize: HEADING_SIZES[block.level],
        bold: true,
        margin: [0, 8, 0, 4],
      } as Content);
    } else if (block.type === 'paragraph') {
      content.push({ ...(pdfRuns(block.runs) as object), margin: [0, 2, 0, 2] } as Content);
    } else {
      const items = block.items.map((item) => pdfRuns(item));
      content.push(block.ordered ? { ol: items, margin: [0, 2, 0, 2] } : { ul: items, margin: [0, 2, 0, 2] });
    }
  }

  const definition: TDocumentDefinitions = {
    pageSize: 'LETTER',
    pageMargins: [72, 72, 72, 72],
    defaultStyle: { fontSize: 11, lineHeight: 1.3 },
    content,
  };

  return new Promise<Blob>((resolve, reject) => {
    try {
      pdfMake.createPdf(definition).getBlob((blob: Blob) => resolve(blob));
    } catch (err) {
      reject(err);
    }
  });
}
