// ==============================================
// TIPTAP TEXT — plain-text views of a Tiptap document
// ==============================================
// Thin wrappers over the testimony-export block core (the single Tiptap
// traversal in this codebase) so excerpting and copying can never drift
// from the PDF/DOCX exports on new node types.

import { blocksToPlainText, tiptapToBlocks, type TextRun } from '@/lib/testimony-export/blocks';

/**
 * Full plain text of a Tiptap document: blocks separated by blank lines,
 * list items bulleted/numbered one per line. '' for empty or malformed
 * documents (e.g. the DB default '{}').
 */
export function tiptapPlainText(doc: unknown): string {
  return blocksToPlainText(tiptapToBlocks(doc));
}

/**
 * Single-line excerpt of a Tiptap document, truncated to `maxLength` on a
 * word boundary with an ellipsis. Newlines collapse to spaces.
 */
export function tiptapExcerpt(doc: unknown, maxLength = 180): string {
  const full = tiptapPlainText(doc).replace(/\s+/g, ' ').trim();
  if (full.length <= maxLength) return full;

  const cut = full.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : maxLength).trimEnd()}…`;
}

/**
 * Whether a Tiptap document has any written text. Whitespace, empty
 * paragraphs, and empty list items (which plain text would still bullet)
 * don't count — an empty testimony shouldn't move on to Review.
 */
export function tiptapHasText(doc: unknown): boolean {
  const hasText = (runs: TextRun[]) => runs.some((run) => run.text.trim() !== '');
  return tiptapToBlocks(doc).some((block) =>
    block.type === 'list' ? block.items.some(hasText) : hasText(block.runs),
  );
}
