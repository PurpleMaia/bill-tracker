// DOCX generator. Imported dynamically from the export step so the `docx`
// bundle stays out of the main chunk.

import {
  AlignmentType,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun as DocxTextRun,
} from 'docx';
import type { TestimonyBlock, TestimonyMeta, TextRun } from './blocks';
import { composeHeaderLines } from './blocks';

const HEADING_LEVELS = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
} as const;

const NUMBERING_REF = 'testimony-ordered';

function docxRuns(runs: TextRun[]): DocxTextRun[] {
  return runs.map(
    (run) =>
      new DocxTextRun({
        text: run.text,
        bold: run.bold,
        italics: run.italic,
        underline: run.underline ? {} : undefined,
        strike: run.strike,
        // Word wants a single family name, not a CSS stack.
        font: run.font ? run.font.split(',')[0].replace(/["']/g, '').trim() : undefined,
      }),
  );
}

export async function generateTestimonyDocx(
  meta: TestimonyMeta,
  blocks: TestimonyBlock[],
): Promise<Blob> {
  const children: Paragraph[] = [];

  composeHeaderLines(meta).forEach((line, index) => {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new DocxTextRun({ text: line, bold: index === 0 })],
      }),
    );
  });
  children.push(new Paragraph({ children: [] })); // spacer between header and body

  for (const block of blocks) {
    if (block.type === 'heading') {
      children.push(
        new Paragraph({ heading: HEADING_LEVELS[block.level], children: docxRuns(block.runs) }),
      );
    } else if (block.type === 'paragraph') {
      children.push(new Paragraph({ children: docxRuns(block.runs) }));
    } else {
      for (const item of block.items) {
        children.push(
          new Paragraph({
            children: docxRuns(item),
            ...(block.ordered
              ? { numbering: { reference: NUMBERING_REF, level: 0 } }
              : { bullet: { level: 0 } }),
          }),
        );
      }
    }
  }

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: NUMBERING_REF,
          levels: [
            { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START },
          ],
        },
      ],
    },
    sections: [{ children }],
  });

  return Packer.toBlob(doc);
}
