'use client';

import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Redo2,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react';

const FONT_OPTIONS = [
  { label: 'Default', value: 'default' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Courier New', value: '"Courier New", monospace' },
];

const HEADING_OPTIONS = [
  { label: 'Paragraph', value: 'p' },
  { label: 'Heading 1', value: '1' },
  { label: 'Heading 2', value: '2' },
  { label: 'Heading 3', value: '3' },
];

interface TestimonyEditorProps {
  /** Tiptap JSON to load once on mount (render only after the draft has loaded). */
  initialContent: unknown | null;
  onChange: (json: unknown) => void;
}

function MarkButton({
  editor,
  active,
  onClick,
  label,
  children,
}: {
  editor: Editor;
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={label}
      aria-pressed={active}
      disabled={!editor.isEditable}
      onClick={onClick}
      className={cn('h-8 w-8 p-0', active && 'bg-accent text-accent-foreground')}
    >
      {children}
    </Button>
  );
}

export function TestimonyEditor({ initialContent, onChange }: TestimonyEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ blockquote: false, codeBlock: false, code: false, horizontalRule: false }),
      Underline,
      TextStyle,
      FontFamily,
    ],
    content: (initialContent as object) ?? '',
    immediatelyRender: false,
    onUpdate: ({ editor: instance }) => onChange(instance.getJSON()),
    editorProps: {
      attributes: {
        class: cn(
          'min-h-[55vh] px-4 py-3 text-sm leading-relaxed focus:outline-none',
          '[&_h1]:text-3xl [&_h1]:font-bold [&_h1]:my-3',
          '[&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:my-3',
          '[&_h3]:text-xl [&_h3]:font-semibold [&_h3]:my-2',
          '[&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6',
        ),
      },
    },
  });

  if (!editor) return null;

  const activeHeading = editor.isActive('heading', { level: 1 })
    ? '1'
    : editor.isActive('heading', { level: 2 })
      ? '2'
      : editor.isActive('heading', { level: 3 })
        ? '3'
        : 'p';

  const activeFont =
    FONT_OPTIONS.find((f) => f.value !== 'default' && editor.isActive('textStyle', { fontFamily: f.value }))
      ?.value ?? 'default';

  return (
    <div className="rounded-lg border bg-card">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
        <Select
          value={activeFont}
          onValueChange={(value) => {
            if (value === 'default') editor.chain().focus().unsetFontFamily().run();
            else editor.chain().focus().setFontFamily(value).run();
          }}
        >
          <SelectTrigger className="h-8 w-[150px] text-xs">
            <SelectValue placeholder="Font" />
          </SelectTrigger>
          <SelectContent>
            {FONT_OPTIONS.map((font) => (
              <SelectItem key={font.value} value={font.value} className="text-xs">
                {font.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={activeHeading}
          onValueChange={(value) => {
            if (value === 'p') editor.chain().focus().setParagraph().run();
            else editor.chain().focus().toggleHeading({ level: Number(value) as 1 | 2 | 3 }).run();
          }}
        >
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue placeholder="Style" />
          </SelectTrigger>
          <SelectContent>
            {HEADING_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value} className="text-xs">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <MarkButton editor={editor} label="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </MarkButton>
        <MarkButton editor={editor} label="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </MarkButton>
        <MarkButton editor={editor} label="Underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon className="h-4 w-4" />
        </MarkButton>
        <MarkButton editor={editor} label="Strikethrough" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough className="h-4 w-4" />
        </MarkButton>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <MarkButton editor={editor} label="Bullet list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="h-4 w-4" />
        </MarkButton>
        <MarkButton editor={editor} label="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-4 w-4" />
        </MarkButton>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <MarkButton editor={editor} label="Undo" active={false} onClick={() => editor.chain().focus().undo().run()}>
          <Undo2 className="h-4 w-4" />
        </MarkButton>
        <MarkButton editor={editor} label="Redo" active={false} onClick={() => editor.chain().focus().redo().run()}>
          <Redo2 className="h-4 w-4" />
        </MarkButton>
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}
