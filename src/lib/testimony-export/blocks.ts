// ==============================================
// TESTIMONY EXPORT — pure Tiptap-JSON → blocks core
// ==============================================
// Pure functions only (no DB, no DOM). The PDF and DOCX generators both
// consume this neutral block shape so the two exports can never drift.

import type { TestimonyPosition } from '@/types/testimony';

export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  /** CSS font-family from the editor's textStyle mark, e.g. 'Georgia, serif'. */
  font?: string;
  /** A hard line break (Shift+Enter); text is ''. */
  break?: true;
}

export type TestimonyBlock =
  | { type: 'heading'; level: 1 | 2 | 3; runs: TextRun[] }
  | { type: 'paragraph'; runs: TextRun[] }
  | { type: 'list'; ordered: boolean; items: TextRun[][] };

interface TiptapMark {
  type?: string;
  attrs?: { fontFamily?: string };
}

interface TiptapNode {
  type?: string;
  text?: string;
  attrs?: { level?: number };
  marks?: TiptapMark[];
  content?: TiptapNode[];
}

function textRuns(node: TiptapNode): TextRun[] {
  const runs: TextRun[] = [];
  for (const child of node.content ?? []) {
    if (child.type === 'hardBreak') {
      runs.push({ text: '', break: true });
      continue;
    }
    if (child.type !== 'text' || typeof child.text !== 'string') continue;
    const run: TextRun = { text: child.text };
    for (const mark of child.marks ?? []) {
      if (mark.type === 'bold') run.bold = true;
      if (mark.type === 'italic') run.italic = true;
      if (mark.type === 'underline') run.underline = true;
      if (mark.type === 'strike') run.strike = true;
      if (mark.type === 'textStyle' && mark.attrs?.fontFamily) run.font = mark.attrs.fontFamily;
    }
    runs.push(run);
  }
  return runs;
}

/**
 * Converts a single listItem into one or more items (TextRun[][]).
 * The first entry is the item's own paragraph runs; nested bulletList/orderedList
 * children are recursively flattened as additional entries.
 */
function listItemToItems(item: TiptapNode): TextRun[][] {
  const ownRuns = (item.content ?? [])
    .filter((child) => child.type === 'paragraph')
    .flatMap((child) => textRuns(child));
  const nested = (item.content ?? [])
    .filter((child) => child.type === 'bulletList' || child.type === 'orderedList')
    .flatMap((list) =>
      (list.content ?? [])
        .filter((child) => child.type === 'listItem')
        .flatMap(listItemToItems),
    );
  return [ownRuns, ...nested];
}

/** Converts a Tiptap document JSON into neutral testimony blocks. */
export function tiptapToBlocks(doc: unknown): TestimonyBlock[] {
  const root = doc as TiptapNode | null;
  if (!root || typeof root !== 'object' || !Array.isArray(root.content)) return [];

  const blocks: TestimonyBlock[] = [];
  for (const node of root.content) {
    switch (node.type) {
      case 'heading': {
        const raw = Number(node.attrs?.level) || 1;
        const level = Math.min(Math.max(raw, 1), 3) as 1 | 2 | 3;
        blocks.push({ type: 'heading', level, runs: textRuns(node) });
        break;
      }
      case 'paragraph':
        blocks.push({ type: 'paragraph', runs: textRuns(node) });
        break;
      case 'bulletList':
      case 'orderedList': {
        const items = (node.content ?? [])
          .filter((child) => child.type === 'listItem')
          .flatMap(listItemToItems);
        blocks.push({ type: 'list', ordered: node.type === 'orderedList', items });
        break;
      }
      default:
        break; // unknown node types are skipped
    }
  }
  return blocks;
}

/** Everything the export header needs, resolved by the caller. */
export interface TestimonyMeta {
  billNumber: string;
  billTitle: string;
  committee: string | null;
  position: TestimonyPosition;
  authorName: string;
  organization: string;
  dateStr: string;
}

export function positionLabel(position: TestimonyPosition): string {
  switch (position) {
    case 'support':
      return 'Testimony in SUPPORT of';
    case 'oppose':
      return 'Testimony in OPPOSITION to';
    default:
      return 'Comments on';
  }
}

/** Header lines in conventional Hawaii testimony order. */
export function composeHeaderLines(meta: TestimonyMeta): string[] {
  const lines = [
    `${positionLabel(meta.position)} ${meta.billNumber}`,
    meta.billTitle,
  ];
  if (meta.committee) lines.push(`Committee: ${meta.committee}`);
  lines.push(
    `Submitted by: ${meta.authorName}${meta.organization ? `, ${meta.organization}` : ''}`,
    meta.dateStr,
  );
  return lines;
}
