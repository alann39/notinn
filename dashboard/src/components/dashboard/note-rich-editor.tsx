import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { marked } from "marked";
import DOMPurify from "dompurify";
import TurndownService from "turndown";
// turndown-plugin-gfm ships JavaScript only; there is no declaration file.
// @ts-expect-error -- untyped plugin
import { gfm } from "turndown-plugin-gfm";
import {
  Bold,
  FileText,
  Code2,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Quote,
  Redo2,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizeMarkdownLists } from "@/lib/markdown-lists";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipPopup,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import "@/styles/note-rich-editor.css";

type NoteRichEditorProps = {
  /** Current draft in markdown. Owned by the parent. */
  markdown: string;
  /** Receives markdown whenever the editor settles. */
  onChange: (markdown: string) => void;
  editable?: boolean;
  /**
   * When false the editor is hidden (Source mode). External markdown is not
   * pushed into it until it becomes active again, which keeps source editing
   * from rebuilding the hidden document on every keystroke.
   */
  active?: boolean;
  /** Save/cancel/source controls rendered at the right end of the toolbar. */
  onSave?: () => void;
  onCancel?: () => void;
  onToggleSource?: () => void;
  isSaving?: boolean;
  canSave?: boolean;
  sourceLabel?: string;
  /** Called with the selected text when the user promotes it to the summary. */
  onMakeSummary?: (text: string) => void;
  /** Called with the selected text when the user adds it as a key point. */
  onMakeKeyPoint?: (text: string) => void;
};

const EMIT_DELAY_MS = 250;

const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = IS_MAC ? "⌘" : "Ctrl+";
const SHIFT = IS_MAC ? "⇧" : "Shift+";
const ALT = IS_MAC ? "⌥" : "Alt+";

/**
 * Typography mirrors the read-mode document canvas: same body size, heading
 * scale, list indentation and code/quote treatments.
 */
const EDITOR_CLASS = cn(
  "min-h-[45vh] w-full px-5 py-4 font-sans text-sm leading-relaxed text-foreground/90 outline-none sm:min-h-[60vh] sm:px-10 sm:py-8 sm:text-base",
  "[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:tracking-tight [&_h1]:font-heading",
  "[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:font-heading",
  "[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:font-heading",
  "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-2",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em]",
  "[&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted/70 [&_pre]:p-3",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[0.9em]",
  "[&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:italic",
  "[&_hr]:my-6 [&_hr]:border-border",
);

/**
 * A single Turndown instance is reused for every edit. GFM supplies the table
 * and strikethrough rules; task items need their own rule because Tiptap wraps
 * the checkbox in a `<label>`, which the stock plugin does not look through.
 */
const turndownService = new TurndownService({
  headingStyle: "atx",
  hr: "---",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  fence: "```",
  emDelimiter: "*",
  strongDelimiter: "**",
  linkStyle: "inlined",
});

turndownService.use(gfm);

// Tiptap wraps list text in paragraphs; Turndown's stock rule then leaves a
// blank, indented line after every item. Emit tight GFM list items instead.
// Turndown prepends new rules, so the task rule below must be added last.
turndownService.addRule("listItem", {
  filter: "li",
  replacement: (content, node, options) => {
    const body = content.replace(/^\n+|\n+$/g, "").replace(/\n/g, "\n    ");
    const parent = node.parentElement;
    let prefix = `${options.bulletListMarker} `;
    if (parent?.nodeName === "OL") {
      const start = parent.getAttribute("start");
      const index = Array.prototype.indexOf.call(parent.children, node);
      prefix = `${start ? Number(start) + index : index + 1}. `;
    }
    return `${prefix}${body}${node.nextSibling ? "\n" : ""}`;
  },
});

turndownService.addRule("taskListItem", {
  filter: (node) =>
    node.nodeName === "LI" && node.getAttribute("data-type") === "taskItem",
  replacement: (content, node) => {
    const checked = node.getAttribute("data-checked") === "true";
    const body = content.replace(/^\n+|\n+$/g, "").replace(/\n/g, "\n    ");
    return `- [${checked ? "x" : " "}] ${body}${node.nextSibling ? "\n" : ""}`;
  },
});

/**
 * Markdown to the HTML dialect Tiptap understands.
 *
 * `marked` emits GFM checkboxes as `<input type="checkbox">` inside a plain
 * `<li>`; Tiptap's task nodes only parse their own `data-type` markers, so
 * those markers are added here. Everything runs through DOMPurify first.
 */
function markdownToEditorHtml(markdown: string): string {
  if (!markdown) return "";
  const rawHtml = marked.parse(normalizeMarkdownLists(markdown), { async: false }) as string;
  const safeHtml = DOMPurify.sanitize(rawHtml);
  if (typeof window === "undefined") return safeHtml;

  const document = new DOMParser().parseFromString(safeHtml, "text/html");
  document.querySelectorAll("li").forEach((item) => {
    const checkbox = item.querySelector<HTMLInputElement>(
      ":scope > input[type='checkbox']",
    );
    if (!checkbox) return;

    item.setAttribute("data-type", "taskItem");
    item.setAttribute(
      "data-checked",
      checkbox.hasAttribute("checked") ? "true" : "false",
    );
    checkbox.remove();

    const list = item.parentElement;
    if (list?.tagName === "UL") list.setAttribute("data-type", "taskList");
  });

  return document.body.innerHTML;
}

type ToolbarButtonProps = {
  label: string;
  shortcut?: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
};

function ToolbarButton({
  label,
  shortcut,
  onClick,
  active,
  disabled,
  children,
}: ToolbarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            title={label}
            aria-label={shortcut ? `${label} (${shortcut})` : label}
            aria-pressed={active === undefined ? undefined : active}
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClick}
            className={cn(
              "inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40 sm:size-9",
              active && "bg-muted text-foreground",
            )}
          >
            {children}
          </button>
        }
      />
      <TooltipPopup
        side="bottom"
        sideOffset={6}
        className="flex items-center gap-2 px-2 py-1"
      >
        <span className="text-[11px] font-medium text-popover-foreground">
          {label}
        </span>
        {shortcut ? (
          <kbd className="rounded border border-border/70 bg-muted px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground">
            {shortcut}
          </kbd>
        ) : null}
      </TooltipPopup>
    </Tooltip>
  );
}

function ToolbarDivider() {
  return (
    <span
      aria-hidden="true"
      className="mx-0.5 h-5 w-px shrink-0 bg-border"
    />
  );
}

export function NoteRichEditor({
  markdown,
  onChange,
  editable = true,
  active = true,
  onSave,
  onCancel,
  onToggleSource,
  isSaving = false,
  canSave = false,
  sourceLabel = "Source",
  onMakeSummary,
  onMakeKeyPoint,
}: NoteRichEditorProps) {
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");

  const onChangeRef = useRef(onChange);
  const editorRef = useRef<Editor | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const openLinkDialog = useCallback(() => {
    const instance = editorRef.current;
    if (!instance) return;
    const current = instance.getAttributes("link").href as string | undefined;
    setLinkValue(current ?? "");
    setLinkDialogOpen(true);
  }, []);

  /**
   * Editor-level shortcuts. Tiptap ships bold/italic/undo/redo only, so the
   * structure commands are bound here and the toolbar tooltips advertise the
   * same set — keep the two lists in sync.
   */
  const runShortcut = useCallback(
    (event: KeyboardEvent): boolean => {
      const instance = editorRef.current;
      if (!instance) return false;
      if (!(event.metaKey || event.ctrlKey)) return false;

      const chain = () => instance.chain().focus();

      if (event.altKey && !event.shiftKey) {
        if (event.code === "Digit2") {
          chain().toggleHeading({ level: 2 }).run();
          return true;
        }
        if (event.code === "Digit3") {
          chain().toggleHeading({ level: 3 }).run();
          return true;
        }
        if (event.code === "KeyC") {
          chain().toggleCodeBlock().run();
          return true;
        }
        return false;
      }

      if (event.shiftKey) {
        if (event.code === "Digit7") {
          chain().toggleOrderedList().run();
          return true;
        }
        if (event.code === "Digit8") {
          chain().toggleBulletList().run();
          return true;
        }
        if (event.code === "Digit9") {
          chain().toggleTaskList().run();
          return true;
        }
        if (event.code === "Period") {
          chain().toggleBlockquote().run();
          return true;
        }
        return false;
      }

      if (event.code === "KeyK") {
        openLinkDialog();
        return true;
      }

      return false;
    },
    [openLinkDialog],
  );

  const lastEmittedRef = useRef(markdown);
  const debounceRef = useRef<number | null>(null);
  const hasInteractedRef = useRef(false);
  const hasUserEditedRef = useRef(false);

  const flushPending = useCallback(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const instance = editorRef.current;
    if (!instance || !hasUserEditedRef.current) return;
    const next = turndownService.turndown(instance.getHTML());
    if (next === lastEmittedRef.current) return;
    lastEmittedRef.current = next;
    onChangeRef.current(next);
  }, []);

  const scheduleEmit = useCallback((instance: Editor) => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      if (!hasUserEditedRef.current) return;
      const next = turndownService.turndown(instance.getHTML());
      if (next === lastEmittedRef.current) return;
      lastEmittedRef.current = next;
      onChangeRef.current(next);
    }, EMIT_DELAY_MS);
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: "noopener noreferrer nofollow" },
        },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: markdownToEditorHtml(markdown),
    immediatelyRender: false,
    editable,
    editorProps: {
      attributes: {
        class: EDITOR_CLASS,
        role: "textbox",
        "aria-label": "Note body",
        "aria-multiline": "true",
      },
      handleKeyDown: (_view, event) => {
        // The page-level shortcut saves through a synchronously updated ref.
        // Flush first so the final keystrokes are included.
        hasInteractedRef.current = true;
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          flushPending();
          return false;
        }
        if (runShortcut(event)) {
          event.preventDefault();
          return true;
        }
        return false;
      },
      handleDOMEvents: {
        pointerdown: () => {
          hasInteractedRef.current = true;
          return false;
        },
        beforeinput: () => {
          hasInteractedRef.current = true;
          return false;
        },
        compositionstart: () => {
          hasInteractedRef.current = true;
          return false;
        },
      },
    },
    onUpdate: ({ editor: instance }) => scheduleEmit(instance),
    onTransaction: ({ transaction }) => {
      // Creating the document emits an update too. Only a real document change
      // that follows user input should overwrite the parent's markdown.
      if (transaction.docChanged && hasInteractedRef.current) {
        hasUserEditedRef.current = true;
      }
    },
    onBlur: () => flushPending(),
  });

  useEffect(() => {
    editorRef.current = editor;
    if (editor) editor.setEditable(editable);
  }, [editor, editable]);

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Adopt external changes (source mode, restored draft) without clobbering the
  // user's cursor on the debounced echo of their own edits.
  useEffect(() => {
    if (!active) return;
    const instance = editorRef.current;
    if (!instance) return;
    if (markdown === lastEmittedRef.current) return;
    lastEmittedRef.current = markdown;
    instance.commands.setContent(markdownToEditorHtml(markdown), {
      emitUpdate: false,
    });
  }, [markdown, active]);

  const toolbarState = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      h2: current?.isActive("heading", { level: 2 }) ?? false,
      h3: current?.isActive("heading", { level: 3 }) ?? false,
      bold: current?.isActive("bold") ?? false,
      italic: current?.isActive("italic") ?? false,
      bulletList: current?.isActive("bulletList") ?? false,
      orderedList: current?.isActive("orderedList") ?? false,
      taskList: current?.isActive("taskList") ?? false,
      blockquote: current?.isActive("blockquote") ?? false,
      codeBlock: current?.isActive("codeBlock") ?? false,
      link: current?.isActive("link") ?? false,
      canUndo: current?.can().undo() ?? false,
      canRedo: current?.can().redo() ?? false,
      hasSelection: current ? !current.state.selection.empty : false,
    }),
  });

  const applyLink = () => {
    const instance = editorRef.current;
    if (!instance) return;
    hasInteractedRef.current = true;
    const raw = linkValue.trim();
    const chain = instance.chain().focus().extendMarkRange("link");
    if (!raw) {
      chain.unsetLink().run();
      setLinkDialogOpen(false);
      return;
    }
    const href = /^(https?:\/\/|mailto:|tel:|#|\/)/i.test(raw)
      ? raw
      : `https://${raw}`;
    chain.setLink({ href }).run();
    setLinkDialogOpen(false);
  };

  return (
    <>
      <TooltipProvider delay={200}>
      <div className="note-rich-editor w-full min-w-0 rounded-xl border border-border bg-muted/10 transition-shadow focus-within:ring-2 focus-within:ring-foreground/40">
      <div
        role="toolbar"
        aria-label="Formatting"
        onClickCapture={() => {
          hasInteractedRef.current = true;
        }}
        className="sticky top-[4.75rem] z-20 mx-2 mt-2 flex items-center gap-1 overflow-x-auto rounded-xl border border-border bg-background px-2 py-1.5 shadow-sm"
      >
        <ToolbarButton
          label="Heading 2"
          shortcut={`${MOD}${ALT}2`}
          active={toolbarState?.h2}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Heading 3"
          shortcut={`${MOD}${ALT}3`}
          active={toolbarState?.h3}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 className="size-4" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          label="Bold"
          shortcut={`${MOD}B`}
          active={toolbarState?.bold}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          shortcut={`${MOD}I`}
          active={toolbarState?.italic}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic className="size-4" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          label="Bullet list"
          shortcut={`${MOD}${SHIFT}8`}
          active={toolbarState?.bulletList}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          shortcut={`${MOD}${SHIFT}7`}
          active={toolbarState?.orderedList}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Checklist"
          shortcut={`${MOD}${SHIFT}9`}
          active={toolbarState?.taskList}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleTaskList().run()}
        >
          <ListChecks className="size-4" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          label="Blockquote"
          shortcut={`${MOD}${SHIFT}.`}
          active={toolbarState?.blockquote}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Code block"
          shortcut={`${MOD}${ALT}C`}
          active={toolbarState?.codeBlock}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
        >
          <Code2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Link"
          shortcut={`${MOD}K`}
          active={toolbarState?.link}
          disabled={!editor}
          onClick={openLinkDialog}
        >
          <Link2 className="size-4" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          label="Undo"
          shortcut={`${MOD}Z`}
          disabled={!editor || !toolbarState?.canUndo}
          onClick={() => editor?.chain().focus().undo().run()}
        >
          <Undo2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Redo"
          shortcut={`${MOD}${SHIFT}Z`}
          disabled={!editor || !toolbarState?.canRedo}
          onClick={() => editor?.chain().focus().redo().run()}
        >
          <Redo2 className="size-4" />
        </ToolbarButton>

        <div className="ml-auto flex shrink-0 items-center gap-1 pl-2">
          {onMakeSummary && (
            <button
              type="button"
              disabled={!toolbarState?.hasSelection}
              onClick={() => {
                const instance = editorRef.current;
                if (!instance) return;
                const { from, to } = instance.state.selection;
                const text = instance.state.doc.textBetween(from, to, " ").trim();
                if (text) onMakeSummary(text);
              }}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
              title="Pakai teks terpilih sebagai summary"
            >
              <Quote className="size-3.5" />
              <span>Summary</span>
            </button>
          )}
          {onMakeKeyPoint && (
            <button
              type="button"
              disabled={!toolbarState?.hasSelection}
              onClick={() => {
                const instance = editorRef.current;
                if (!instance) return;
                const { from, to } = instance.state.selection;
                const text = instance.state.doc.textBetween(from, to, " ").trim();
                if (text) onMakeKeyPoint(text);
              }}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
              title="Tambah teks terpilih sebagai key point"
            >
              <List className="size-3.5" />
              <span>Key point</span>
            </button>
          )}
          {onToggleSource && (
            <button
              type="button"
              onClick={onToggleSource}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Toggle Markdown source"
            >
              <FileText className="size-3.5" />
              <span>{sourceLabel}</span>
            </button>
          )}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isSaving}
              className="hidden min-h-9 items-center rounded-md border border-border px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50 sm:inline-flex"
            >
              Cancel
            </button>
          )}
          {onSave && (
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving || !canSave}
              className="hidden min-h-9 items-center gap-1.5 rounded-md bg-foreground px-2.5 text-[11px] font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-40 sm:inline-flex"
            >
              {isSaving ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </div>

      <EditorContent editor={editor} />
      </div>
    </TooltipProvider>

    <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
      <DialogPopup className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Link</DialogTitle>
          <DialogDescription>
            Tempel URL. Teks yang diseleksi bakal jadi hyperlink. Kosongkan untuk
            menghapus link.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            applyLink();
          }}
        >
          <div className="px-6 pb-4">
            <input
              value={linkValue}
              onChange={(event) => setLinkValue(event.target.value)}
              placeholder="https://contoh.com"
              inputMode="url"
              autoFocus
              aria-label="Link URL"
              className="w-full rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5 font-mono text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:border-border focus-visible:ring-2 focus-visible:ring-foreground/30"
            />
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setLinkDialogOpen(false)}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-muted sm:min-h-9"
            >
              Batal
            </button>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-foreground px-3 text-xs font-semibold text-background hover:opacity-90 sm:min-h-9"
            >
              Terapkan
            </button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
    </>
  );
}
