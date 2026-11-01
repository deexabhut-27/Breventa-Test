import DOMPurify from 'dompurify';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Heading3, Italic, List, ListOrdered, Redo2, Underline, Undo2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { cx } from './ui.jsx';

const ALLOWED = { ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'h2', 'h3', 'blockquote', 'code', 'pre', 'a'], ALLOWED_ATTR: ['href', 'target', 'rel'] };

/** Renders a saved note. Notes are sanitised on the server too; this is a second line of defence. */
export function RichTextView({ html, className }) {
  return <div className={cx('rich text-sm text-slate-800', className)} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html || '', ALLOWED) }} />;
}

function ToolButton({ active, onClick, label, icon: Icon, disabled }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} // keep the editor's selection
      onClick={onClick}
      className={cx('rounded-md p-1.5 text-slate-600 hover:bg-slate-200 disabled:opacity-40', active && 'bg-brand-100 text-brand-700')}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

/** Small rich-text editor for notes: bold, italic, underline, heading, bullet and numbered lists. */
export function RichTextEditor({ value, onChange, placeholder, onSubmitShortcut, syncKey }) {
  // The editor is created once, so keyboard handlers read the latest callbacks through refs.
  const submitRef = useRef(onSubmitShortcut);
  const changeRef = useRef(onChange);
  submitRef.current = onSubmitShortcut;
  changeRef.current = onChange;
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [3] }, codeBlock: false, horizontalRule: false })],
    content: value || '',
    immediatelyRender: true,
    editorProps: {
      attributes: { class: 'rich min-h-40 px-3 py-2 text-sm text-slate-800 focus:outline-none', 'aria-label': placeholder || 'Note' },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          submitRef.current?.();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => changeRef.current(e.isEmpty ? '' : e.getHTML()),
  });

  // Toolbar state follows the cursor (is the text under it bold, in a list, …).
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive('bold'),
            italic: e.isActive('italic'),
            underline: e.isActive('underline'),
            heading: e.isActive('heading', { level: 3 }),
            bullet: e.isActive('bulletList'),
            ordered: e.isActive('orderedList'),
            canUndo: e.can().undo(),
            canRedo: e.can().redo(),
          }
        : {},
  });

  // When the parent bumps `syncKey` (e.g. a colleague's newer version arrived), show `value` without
  // treating it as a local edit.
  const valueRef = useRef(value);
  valueRef.current = value;
  useEffect(() => {
    if (editor && syncKey !== undefined) editor.commands.setContent(valueRef.current || '', { emitUpdate: false });
  }, [editor, syncKey]);

  if (!editor) return null;
  const chain = () => editor.chain().focus();
  return (
    <div className="rounded-lg border border-slate-300 bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-1.5 py-1">
        <ToolButton label="Bold (Ctrl/Cmd+B)" icon={Bold} active={state.bold} onClick={() => chain().toggleBold().run()} />
        <ToolButton label="Italic (Ctrl/Cmd+I)" icon={Italic} active={state.italic} onClick={() => chain().toggleItalic().run()} />
        <ToolButton label="Underline (Ctrl/Cmd+U)" icon={Underline} active={state.underline} onClick={() => chain().toggleUnderline().run()} />
        <span className="mx-1 h-5 w-px bg-slate-300" />
        <ToolButton label="Heading" icon={Heading3} active={state.heading} onClick={() => chain().toggleHeading({ level: 3 }).run()} />
        <ToolButton label="Bullet list" icon={List} active={state.bullet} onClick={() => chain().toggleBulletList().run()} />
        <ToolButton label="Numbered list" icon={ListOrdered} active={state.ordered} onClick={() => chain().toggleOrderedList().run()} />
        <span className="mx-1 h-5 w-px bg-slate-300" />
        <ToolButton label="Undo" icon={Undo2} disabled={!state.canUndo} onClick={() => chain().undo().run()} />
        <ToolButton label="Redo" icon={Redo2} disabled={!state.canRedo} onClick={() => chain().redo().run()} />
      </div>
      <div className="relative max-h-[45vh] overflow-y-auto">
        {editor.isEmpty && placeholder && <p className="pointer-events-none absolute top-2 left-3 text-sm text-slate-400">{placeholder}</p>}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
