import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { supabase, SUPABASE_URL } from "@/lib/supabase";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuItem,
  MenuSeparator,
} from "@/components/ui/menu";
import {
  Popover,
  PopoverTrigger,
  PopoverPopup,
} from "@/components/ui/popover";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogPopup,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipPopup,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionPanel,
} from "@/components/ui/accordion";
import { toastManager } from "@/components/ui/toast";
import { NoteRichEditor } from "@/components/dashboard/note-rich-editor";
import type { TemplateOption } from "@/components/dashboard/note-preview-drawer";
import {
  AlertCircle,
  AlignCenter,
  AlignJustify,
  AlignLeft,
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileIcon,
  FileText,
  History,
  Image,
  Loader2,
  Mic,
  Pencil,
  Plus,
  Save,
  X,
  Tag,
  CheckSquare,
  List,
  Sparkles,
  Trash2,
} from "lucide-react";
import { formatDate, formatRelativeTime } from "@/lib/utils";
import type { ActionItem, Note, StructuredNote } from "@/types/notes";
import { cn } from "@/lib/utils";
import {
  ACTION_ITEMS_HEADING,
  KEY_POINTS_HEADING,
  normalizeMarkdownLists,
  stripMarkdownSection,
} from "@/lib/markdown-lists";
import { NoteVersionHistory } from "@/components/dashboard/note-version-history";
import {
  exportNoteToPdf,
  PDF_STYLE_OPTIONS,
  type PdfStyleKey,
} from "@/lib/pdf-export";

/**
 * Marks a field the user edited by hand. Icon only, with the wording moved into
 * a hover tooltip so headers stay light.
 */
const PRIORITY_STYLE: Record<string, { label: string; className: string }> = {
  high: {
    label: "High priority",
    className: "bg-rose-500/15 text-rose-600 border-rose-500/30 dark:text-rose-400",
  },
  medium: {
    label: "Medium priority",
    className:
      "bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400",
  },
  low: {
    label: "Low priority",
    className:
      "bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:text-emerald-400",
  },
};

/**
 * One letter instead of the full word, coloured by level. The word itself lives
 * in the hover tooltip, which keeps tight action-item rows readable.
 */
function PriorityBadge({ level }: { level: string }): React.ReactElement | null {
  const key = level.trim().toLowerCase();
  const style = PRIORITY_STYLE[key];
  if (!style) return null;

  return (
    <TooltipProvider delay={150}>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              className={cn(
                "inline-flex size-5 shrink-0 cursor-default items-center justify-center rounded-md border text-[10px] font-bold uppercase",
                style.className,
              )}
              aria-label={style.label}
            >
              {key.charAt(0)}
            </span>
          }
        />
        <TooltipPopup side="top" sideOffset={6} className="px-2 py-1">
          <span className="text-[11px] font-medium">{style.label}</span>
        </TooltipPopup>
      </Tooltip>
    </TooltipProvider>
  );
}

function ManualBadge(): React.ReactElement {
  return (
    <TooltipProvider delay={150}>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              className="inline-flex size-4 shrink-0 cursor-default items-center justify-center rounded-full bg-muted text-muted-foreground"
              aria-label="Diedit manual"
            >
              <Pencil className="size-2.5" />
            </span>
          }
        />
        <TooltipPopup side="top" sideOffset={6} className="px-2 py-1">
          <span className="text-[11px] font-medium">Diedit manual</span>
        </TooltipPopup>
      </Tooltip>
    </TooltipProvider>
  );
}

const SOURCE_LABELS: Record<string, string> = {
  text: "Text",
  voice: "Voice Note",
  audio: "Audio",
  image: "Screenshot",
  pdf: "PDF",
  docx: "Document",
  txt: "Text File",
  md: "Markdown",
};

const SOURCE_ICONS: Record<string, typeof FileText> = {
  text: FileText,
  voice: Mic,
  audio: Mic,
  image: Image,
  pdf: FileIcon,
  docx: FileIcon,
  txt: FileText,
  md: FileText,
};

function renderMarkdownHtml(markdownText: string): string {
  if (!markdownText) return "";
  const rawHtml = marked.parse(normalizeMarkdownLists(markdownText), {
    async: false,
  }) as string;
  return DOMPurify.sanitize(rawHtml);
}

export function NoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRawView, setIsRawView] = useState(false);
  const [textAlign, setTextAlign] = useState<"left" | "center" | "justify">("justify");
  const [copiedType, setCopiedType] = useState<"markdown" | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>("clean_note");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editMode, setEditMode] = useState<"rich" | "source">("rich");
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [versionDialogOpen, setVersionDialogOpen] = useState(false);
  const [keyPointBusy, setKeyPointBusy] = useState(false);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [actionBusy, setActionBusy] = useState(false);

  // The rich editor emits after a short debounce. Mirror every write into a ref
  // so Save always sees the latest keystroke, even before React re-renders.
  const draftContentRef = useRef("");
  const updateDraftContent = useCallback((value: string) => {
    draftContentRef.current = value;
    setDraftContent(value);
  }, []);

  const fetchNote = useCallback(async () => {
    if (!id) return;
    try {
      const { data, error: rpcError } = await supabase.rpc("web_get_note", {
        p_note_id: id,
      });
      if (rpcError) throw rpcError;
      if (!data || (Array.isArray(data) && data.length === 0)) {
        setError("Could not load note");
        return;
      }
      const loadedNote = Array.isArray(data) ? data[0] : data;
      setNote(loadedNote);
      if (loadedNote.template_key) {
        setSelectedTemplateKey(loadedNote.template_key);
      }
    } catch {
      setError("Could not load note");
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchNote().finally(() => setLoading(false));
  }, [id, fetchNote]);

  const fetchTemplates = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc("web_list_templates", {
        p_input_type: note?.source_type === "audio" ? "audio" : "text",
      });
      if (error) return;
      setTemplates((data as TemplateOption[]) || []);
    } catch {
      // ignore
    }
  }, [note?.source_type]);

  const handleRegenerate = async () => {
    if (!id || !selectedTemplateKey) return;
    setIsRegenerating(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        throw new Error("Session expired. Sign in again.");
      }

      const res = await fetch(`${SUPABASE_URL}/functions/v1/web-regenerate-note`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          note_id: id,
          template_key: selectedTemplateKey,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Could not change template");
      }

      toastManager.add({
        title: "Template updated",
        description: "Note updated with the new template format.",
        type: "success",
      });

      setTemplateDialogOpen(false);
      await fetchNote();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong while processing the template";
      toastManager.add({
        title: "Could not change template",
        description: msg,
        type: "error",
      });
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleDeleteNote = async () => {
    if (!id) return;
    setIsDeleting(true);
    try {
      const { data, error } = await supabase.rpc("web_delete_note", { p_note_id: id });
      if (error) throw error;
      if (data) {
        toastManager.add({
          title: "Note deleted",
          description: "Note permanently deleted.",
          type: "success",
        });
        setDeleteDialogOpen(false);
        navigate("/notes");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not delete note";
      toastManager.add({
        title: "Could not delete note",
        description: msg,
        type: "error",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const noteRecord = note as (Note & {
    output_content_json?: StructuredNote;
    output_rendered_text?: string;
    manual_edit_rendered_text?: string | null;
    manual_edit_updated_at?: string | null;
    content_overlay?: {
      summary?: string;
      key_points?: string[];
      action_items?: ActionItem[];
    } | null;
    key_points?: string[];
    action_items?: ActionItem[];
  }) | null;

  const manualEditText = noteRecord?.manual_edit_rendered_text ?? null;

  const rawContent = noteRecord?.output_content_json || note?.current_output?.content_json;
  const renderedText = noteRecord?.output_rendered_text || note?.current_output?.rendered_text;

  // Ensure we always have content to display in the structured view, even if it's just renderedText
  const effectiveSummary = (note?.summary ?? "").trim() || rawContent?.summary || "";
  const overlayKeyPoints = noteRecord?.content_overlay?.key_points;
  const mergedKeyPoints = noteRecord?.key_points;
  const effectiveKeyPoints: string[] =
    Array.isArray(overlayKeyPoints) && overlayKeyPoints.length > 0
      ? overlayKeyPoints
      : Array.isArray(mergedKeyPoints)
        ? mergedKeyPoints
        : (rawContent?.key_points ?? []);
  const summaryOverridden = Boolean(noteRecord?.content_overlay?.summary);
  const keyPointsOverridden = Array.isArray(overlayKeyPoints);
  const overlayActionItems = noteRecord?.content_overlay?.action_items;
  const effectiveActionItems: ActionItem[] = Array.isArray(overlayActionItems)
    ? overlayActionItems
    : Array.isArray(noteRecord?.action_items)
      ? noteRecord.action_items
      : (rawContent?.action_items ?? []);
  const actionItemsOverridden = Array.isArray(overlayActionItems);

  const flatBodyMarkdown = manualEditText
    ? (() => {
        let body = manualEditText;
        if (keyPointsOverridden) {
          body = stripMarkdownSection(body, KEY_POINTS_HEADING);
        }
        if (actionItemsOverridden) {
          body = stripMarkdownSection(body, ACTION_ITEMS_HEADING);
        }
        return body;
      })()
    : "";

  const content: StructuredNote | undefined = rawContent ?? (renderedText ? {
    title: note?.title || "",
    summary: "",
    key_points: [],
    action_items: [],
    decisions: [],
    uncertainties: [],
    tags: note?.tags ?? [],
    language: note?.language ?? "en",
    confidence: 1,
    sections: [{ heading: "Content", content: renderedText }],
    source_references: [],
  } : undefined);

  const toggleActionItem = (index: number) => {
    setCheckedItems((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const getEffectiveMarkdown = () => {
    if (!note) return "";
    if (manualEditText) return manualEditText;
    if (renderedText) return renderedText;
    if (rawContent) {
      const parts = [`# ${note.title}\n`];
      if (rawContent.summary) parts.push(`## Summary\n${rawContent.summary}\n`);
      if (rawContent.key_points && rawContent.key_points.length > 0) {
        parts.push(`## Key Points\n${rawContent.key_points.map((p) => `- ${p}`).join("\n")}\n`);
      }
      if (rawContent.decisions && rawContent.decisions.length > 0) {
        parts.push(`## Decisions\n${rawContent.decisions.map((d) => `- ${d}`).join("\n")}\n`);
      }
      if (rawContent.action_items && rawContent.action_items.length > 0) {
        parts.push(
          `## Action Items\n${rawContent.action_items
            .map((a) => {
              const text = a.task || a.text || "";
              const due = a.due_date || a.due_date_text || a.due_date_iso;
              return `- [ ] ${text}${due ? ` (Due: ${due})` : ""}`;
            })
            .join("\n")}\n`,
        );
      }
      if (rawContent.sections) {
        rawContent.sections.forEach((sec) => {
          const body = sec.content || sec.body || "";
          parts.push(`## ${sec.heading}\n${body}\n`);
        });
      }
      return parts.join("\n");
    }
    return note.title;
  };

  /* ---------- Manual edit: title + markdown body ---------- */

  const draftStorageKey = id ? `notinn:note-edit:${id}` : null;
  const baselineContent = manualEditText ?? getEffectiveMarkdown();

  const isDirtyEdit = () => {
    if (!isEditing || !note) return false;
    return (
      draftTitle.trim() !== note.title.trim() ||
      draftContentRef.current !== baselineContent
    );
  };

  const clearStoredDraft = () => {
    if (!draftStorageKey) return;
    try {
      window.localStorage.removeItem(draftStorageKey);
    } catch {
      // storage unavailable — drafts simply will not persist
    }
  };

  const startEditing = () => {
    if (!note) return;
    let nextTitle = note.title;
    let nextContent = baselineContent;
    if (draftStorageKey) {
      try {
        const stored = window.localStorage.getItem(draftStorageKey);
        if (stored) {
          const parsed = JSON.parse(stored) as { title?: unknown; content?: unknown };
          if (typeof parsed.title === "string") nextTitle = parsed.title;
          if (typeof parsed.content === "string") nextContent = parsed.content;
        }
      } catch {
        // corrupted draft — fall back to the server copy
      }
    }
    setDraftTitle(nextTitle);
    updateDraftContent(nextContent);
    setIsEditing(true);
    setIsRawView(false);
    setEditMode("rich");
  };

  const finishCancelEdit = () => {
    clearStoredDraft();
    setDiscardDialogOpen(false);
    setIsEditing(false);
    setEditMode("rich");
  };

  const requestCancelEdit = () => {
    if (isDirtyEdit()) {
      setDiscardDialogOpen(true);
      return;
    }
    finishCancelEdit();
  };

  const handleSaveEdit = async () => {
    if (!id) return;
    const nextTitle = draftTitle.trim();
    const nextContent = draftContentRef.current.trim();
    if (!nextTitle) {
      toastManager.add({
        title: "Title cannot be empty",
        description: "Give the note a title before saving.",
        type: "error",
      });
      return;
    }
    if (!nextContent) {
      toastManager.add({
        title: "Content cannot be empty",
        description: "The note body cannot be saved blank.",
        type: "error",
      });
      return;
    }

    setIsSavingEdit(true);
    try {
      const { data, error: rpcError } = await supabase.rpc("web_update_note", {
        p_note_id: id,
        p_title: nextTitle,
        p_rendered_text: nextContent,
      });
      if (rpcError) throw rpcError;

      const row = (Array.isArray(data) ? data[0] : data) as { outcome?: string } | null;
      if (row?.outcome !== "updated") {
        const messages: Record<string, string> = {
          invalid_title: "That title is not valid (max 300 characters).",
          invalid_content: "The note body cannot be empty.",
          content_too_long: "The note body is too long to save.",
          not_found: "This note no longer exists or you cannot edit it.",
        };
        throw new Error(messages[row?.outcome ?? ""] ?? "Could not save changes.");
      }

      clearStoredDraft();
      setIsEditing(false);
      setEditMode("rich");
      await fetchNote();
      toastManager.add({
        title: "Note updated",
        description: "Your changes are saved.",
        type: "success",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not save changes.";
      toastManager.add({
        title: "Could not save changes",
        description: msg,
        type: "error",
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Autosave the in-progress draft to localStorage so a refresh never loses it.
  useEffect(() => {
    if (!isEditing || !draftStorageKey) return;
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          draftStorageKey,
          JSON.stringify({ title: draftTitle, content: draftContent, savedAt: Date.now() }),
        );
      } catch {
        // storage full or blocked
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [isEditing, draftStorageKey, draftTitle, draftContent]);

  // Esc cancels, Cmd/Ctrl+Enter saves.
  useEffect(() => {
    if (!isEditing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestCancelEdit();
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void handleSaveEdit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // A stable signature of the server copy: the local list resets only when the
  // stored data actually changes, never on every keystroke.
  const actionItemsSignature = JSON.stringify(
    effectiveActionItems.map((item) => ({
      text: item.text ?? item.task ?? "",
      owner: item.owner ?? item.assignee ?? null,
      due_date: item.due_date ?? item.due_date_text ?? null,
      priority: item.priority ?? null,
    })),
  );

  useEffect(() => {
    setActionItems(JSON.parse(actionItemsSignature) as ActionItem[]);
  }, [actionItemsSignature]);

  const persistKeyPoints = async (points: string[]) => {
    if (!id) return;
    setKeyPointBusy(true);
    try {
      const { data, error: rpcError } = await supabase.rpc("web_set_note_key_points", {
        p_note_id: id,
        p_key_points: points,
      });
      if (rpcError) throw rpcError;
      const row = (Array.isArray(data) ? data[0] : data) as { outcome?: string } | null;
      if (row?.outcome !== "updated") {
        const messages: Record<string, string> = {
          too_many_points: "Maksimal 50 key point per catatan.",
          invalid_point: "Ada key point yang kepanjangan (maks 1000 karakter).",
          not_found: "Catatan ini tidak bisa diubah.",
        };
        throw new Error(messages[row?.outcome ?? ""] ?? "Tidak bisa menyimpan key point.");
      }
      await fetchNote();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Tidak bisa menyimpan key point.";
      toastManager.add({ title: "Gagal", description: message, type: "error" });
      await fetchNote();
    } finally {
      setKeyPointBusy(false);
    }
  };

  const handleMakeKeyPoint = async (text: string) => {
    const point = text.replace(/\s+/g, " ").trim();
    if (!point) return;
    if (effectiveKeyPoints.includes(point)) {
      toastManager.add({
        title: "Sudah ada",
        description: "Teks itu sudah jadi key point.",
        type: "info",
      });
      return;
    }
    toastManager.add({
      title: "Key point ditambahkan",
      description: "Daftar key point catatan ini diperbarui.",
      type: "success",
    });
    await persistKeyPoints([...effectiveKeyPoints, point]);
  };

  const handleRemoveKeyPoint = async (index: number) => {
    const next = effectiveKeyPoints.filter((_, itemIndex) => itemIndex !== index);
    await persistKeyPoints(next);
  };

  const persistActionItems = async (items: ActionItem[]) => {
    if (!id) return;
    setActionBusy(true);
    try {
      const { data, error: rpcError } = await supabase.rpc(
        "web_set_note_action_items",
        {
          p_note_id: id,
          p_action_items: items
            .map((item) => ({
              text: (item.text ?? item.task ?? "").trim(),
              owner: (item.owner ?? item.assignee ?? null) || null,
              due_date: (item.due_date ?? item.due_date_text ?? null) || null,
              priority: item.priority ?? null,
            }))
            .filter((item) => item.text !== ""),
        },
      );
      if (rpcError) throw rpcError;
      const row = (Array.isArray(data) ? data[0] : data) as { outcome?: string } | null;
      if (row?.outcome !== "updated") {
        const messages: Record<string, string> = {
          too_many_items: "Maksimal 50 action item per catatan.",
          invalid_item: "Ada action item yang formatnya tidak valid.",
          invalid_payload: "Payload action item tidak valid.",
          not_found: "Catatan ini tidak bisa diubah.",
        };
        throw new Error(messages[row?.outcome ?? ""] ?? "Tidak bisa menyimpan action item.");
      }
      await fetchNote();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Tidak bisa menyimpan action item.";
      toastManager.add({ title: "Gagal", description: message, type: "error" });
      await fetchNote();
    } finally {
      setActionBusy(false);
    }
  };

  const patchActionItem = (index: number, patch: Partial<ActionItem>) => {
    setActionItems((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  };

  const handleMakeActionItem = async (text: string) => {
    const next = [
      ...actionItems,
      { text: text.replace(/\s+/g, " ").trim(), owner: null, due_date: null, priority: null },
    ];
    setActionItems(next);
    toastManager.add({
      title: "Action item ditambahkan",
      description: "Isi owner, due date, atau prioritas kalau perlu.",
      type: "success",
    });
    await persistActionItems(next);
  };

  const handleRemoveActionItem = async (index: number) => {
    const next = actionItems.filter((_, itemIndex) => itemIndex !== index);
    setActionItems(next);
    await persistActionItems(next);
  };

  const handleMakeSummary = async (text: string) => {
    if (!id) return;
    const summaryText = text.replace(/\s+/g, " ").trim();
    if (!summaryText) return;
    try {
      const { data, error: rpcError } = await supabase.rpc("web_set_note_summary", {
        p_note_id: id,
        p_summary: summaryText,
      });
      if (rpcError) throw rpcError;
      const row = (Array.isArray(data) ? data[0] : data) as { outcome?: string } | null;
      if (row?.outcome !== "updated") {
        throw new Error(
          row?.outcome === "summary_too_long"
            ? "Teks kepanjangan buat summary (maks 4000 karakter)."
            : "Tidak bisa menyimpan summary.",
        );
      }
      await fetchNote();
      toastManager.add({
        title: "Summary diperbarui",
        description: "Teks terpilih sekarang dipakai sebagai summary catatan ini.",
        type: "success",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Tidak bisa menyimpan summary.";
      toastManager.add({ title: "Gagal", description: message, type: "error" });
    }
  };

  const handleCopyMarkdown = async () => {
    if (!note) return;
    const textToCopy = getEffectiveMarkdown();
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedType("markdown");
      setTimeout(() => setCopiedType(null), 2000);
    } catch {
      console.error("Failed to copy note content");
    }
  };

  const handleDownloadText = (type: "markdown" | "text") => {
    if (!note) return;
    const textToDownload = getEffectiveMarkdown();
    const extension = type === "markdown" ? "md" : "txt";
    const filename = `${note.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.${extension}`;
    const blob = new Blob([textToDownload], {
      type: type === "markdown" ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = async (styleKey: PdfStyleKey = "editorial") => {
    if (!note) return;
    setIsExportingPdf(true);
    try {
      const base: StructuredNote = content ?? {
        title: note.title,
        summary: "",
        key_points: [],
        action_items: [],
        decisions: [],
        uncertainties: [],
        tags: note.tags ?? [],
        language: note.language ?? "en",
        confidence: 1,
        sections: renderedText ? [{ heading: "Content", content: renderedText }] : [],
        source_references: [],
      };
      // The human summary override wins over whatever the model produced.
      const structuredData: StructuredNote = {
        ...base,
        summary: effectiveSummary || base.summary,
        key_points: effectiveKeyPoints.length > 0 ? effectiveKeyPoints : base.key_points,
        action_items:
          effectiveActionItems.length > 0 ? effectiveActionItems : base.action_items,
      };

      const { filename, blob } = await exportNoteToPdf(structuredData, styleKey);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export PDF:", err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  if (loading) {
    return (
      <>
        <Header title="Note" />
        <div className="flex flex-col items-center justify-center py-32 px-4 max-w-sm mx-auto space-y-3">
          <Spinner className="size-6 text-foreground" />
          <p className="text-xs font-medium text-muted-foreground">Loading note document…</p>
        </div>
      </>
    );
  }

  if (error || !note) {
    return (
      <>
        <Header title="Note" />
        <div className="p-6 max-w-xl mx-auto py-16">
          <div className="coss-card p-8 text-center space-y-4">
            <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-muted text-foreground border border-border">
              <AlertCircle className="size-6" />
            </div>
            <h2 className="text-lg font-semibold text-foreground tracking-tight">Note not found</h2>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
              {error ?? "The requested note could not be found or you do not have permission to view it."}
            </p>
            <div className="pt-2">
              <Button
                variant="outline"
                onClick={() => navigate("/notes")}
                className="gap-2 text-xs"
              >
                <ArrowLeft className="size-3.5" />
                Back to all notes
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  const SourceIcon = SOURCE_ICONS[note.source_type] ?? FileText;
  const hasTags = Boolean(note.tags && note.tags.length > 0);

  const textAlignClass =
    textAlign === "justify"
      ? "text-justify"
      : textAlign === "center"
        ? "text-center"
        : "text-left";

  const keyPointsBlock =
    effectiveKeyPoints.length > 0 ? (
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <List className="size-3.5" />
          <span>Key Points</span>
          {keyPointsOverridden && (
            <ManualBadge />
          )}
        </h2>
        <ul className="space-y-2 pl-1">
          {effectiveKeyPoints.map((point, i) => (
            <li key={i} className="flex items-start gap-3 text-sm sm:text-base text-foreground leading-relaxed">
              <span className="text-foreground/70 font-bold select-none">•</span>
              <span className={cn("flex-1 leading-relaxed", textAlignClass)}>{point}</span>
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  const actionItemsBlock =
    effectiveActionItems.length > 0 ? (
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <CheckSquare className="size-3.5" />
          <span>Action Items ({effectiveActionItems.length})</span>
          {actionItemsOverridden && (
            <ManualBadge />
          )}
        </h2>
        <div className="space-y-2 pl-1">
          {effectiveActionItems.map((item, i) => {
            const isChecked = !!checkedItems[i];
            const taskText = item.task || item.text || "";
            const dueDate = item.due_date || item.due_date_text || item.due_date_iso;
            const assignee = item.owner || item.assignee;

            return (
              <div key={i} className="flex items-start gap-3 py-1 text-sm sm:text-base group">
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={() => toggleActionItem(i)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0 space-y-1">
                  <span
                    onClick={() => toggleActionItem(i)}
                    className={cn(
                      "cursor-pointer leading-snug transition-all select-none block",
                      isChecked
                        ? "line-through text-muted-foreground"
                        : "text-foreground font-normal",
                      textAlignClass,
                    )}
                  >
                    {taskText}
                  </span>
                  {(item.priority || dueDate || assignee) && (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground pt-0.5">
                      {item.priority && <PriorityBadge level={item.priority} />}
                      {dueDate && (
                        <span className="font-mono text-[11px]">Due: {dueDate}</span>
                      )}
                      {assignee && (
                        <span className="text-[11px]">Assignee: {assignee}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    ) : null;

  const actionToolbarContent = (
    <>
      {/* Coss Toggle Group for Text Alignment */}
      {!isRawView && (
        <ToggleGroup
          variant="outline"
          size="sm"
          value={[textAlign]}
          onValueChange={(val: unknown) => {
            const selected = Array.isArray(val) ? val[0] : val;
            if (
              typeof selected === "string" &&
              (selected === "left" || selected === "center" || selected === "justify")
            ) {
              setTextAlign(selected);
            }
          }}
          aria-label="Text alignment"
        >
          <ToggleGroupItem value="left" aria-label="Align left">
            <AlignLeft className="size-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem value="center" aria-label="Align center">
            <AlignCenter className="size-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem value="justify" aria-label="Justify text">
            <AlignJustify className="size-3.5" />
          </ToggleGroupItem>
        </ToggleGroup>
      )}

      {/* Compact Coss Switch for Raw View Toggle */}
      <div
        className="flex items-center gap-1.5 px-2 py-1 h-8 rounded-lg border border-border bg-muted/40"
        title={isRawView ? "Back to note view" : "View raw Markdown"}
      >
        <FileText className="size-3.5 text-muted-foreground" />
        <Switch
          checked={isRawView}
          onCheckedChange={(checked) => setIsRawView(checked)}
          aria-label="Toggle raw markdown view"
        />
      </div>

      {/* Change Template Button (Icon-Only) */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          if (note.template_key) setSelectedTemplateKey(note.template_key);
          fetchTemplates();
          setTemplateDialogOpen(true);
        }}
        title="Change template"
        aria-label="Change template"
        className="size-8 p-0"
      >
        <Sparkles className="size-3.5 text-primary" />
      </Button>

      {/* Version History Button (Icon-Only) */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setVersionDialogOpen(true)}
        title="Version history"
        aria-label="Version history"
        className="size-8 p-0"
      >
        <History className="size-3.5" />
      </Button>

      {/* Edit Note Button (Icon-Only) */}
      <Button
        variant="outline"
        size="sm"
        onClick={startEditing}
        disabled={isEditing}
        title="Edit note"
        aria-label="Edit note"
        className="size-8 p-0"
      >
        <Pencil className="size-3.5" />
      </Button>

      {/* Delete Note Button (Icon-Only) */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setDeleteDialogOpen(true)}
        title="Delete note"
        aria-label="Delete note"
        className="size-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
      >
        <Trash2 className="size-3.5" />
      </Button>

      {/* Coss Menu Component for Export Actions (Icon-Only Menu Trigger) */}
      {note.is_saved && (
        <Menu>
          <MenuTrigger
            render={
              <Button
                variant="default"
                size="sm"
                disabled={isExportingPdf}
                title="Export note"
                aria-label="Export note"
                className="size-8 p-0"
              >
                {isExportingPdf ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Download className="size-3.5" />
                )}
              </Button>
            }
          />
          <MenuPopup align="end" className="w-64">
            <div className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              PDF style
            </div>
            {PDF_STYLE_OPTIONS.map((option) => (
              <MenuItem
                key={option.key}
                onClick={() => handleDownloadPdf(option.key)}
                disabled={isExportingPdf}
                className="cursor-pointer gap-2.5 text-xs py-2"
              >
                <FileIcon className="size-4 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="font-medium">Export PDF — {option.label}</span>
                  <span className="text-[10px] text-muted-foreground">{option.hint}</span>
                </div>
              </MenuItem>
            ))}

            <MenuSeparator />

            <MenuItem
              onClick={() => handleDownloadText("markdown")}
              className="cursor-pointer gap-2.5 text-xs py-2"
            >
              <FileText className="size-4 text-muted-foreground" />
              <div className="flex flex-col">
                <span className="font-medium">Download Markdown</span>
                <span className="text-[10px] text-muted-foreground">Formatted .md file</span>
              </div>
            </MenuItem>

            <MenuItem
              onClick={() => handleDownloadText("text")}
              className="cursor-pointer gap-2.5 text-xs py-2"
            >
              <FileText className="size-4 text-muted-foreground" />
              <div className="flex flex-col">
                <span className="font-medium">Download Plain Text</span>
                <span className="text-[10px] text-muted-foreground">Standard .txt file</span>
              </div>
            </MenuItem>

            <MenuSeparator />

            <MenuItem
              onClick={handleCopyMarkdown}
              className="cursor-pointer gap-2.5 text-xs py-2"
            >
              {copiedType === "markdown" ? (
                <>
                  <Check className="size-4 text-foreground" />
                  <span className="font-medium">Copied to Clipboard!</span>
                </>
              ) : (
                <>
                  <Copy className="size-4 text-muted-foreground" />
                  <span className="font-medium">Copy Markdown</span>
                </>
              )}
            </MenuItem>
          </MenuPopup>
        </Menu>
      )}
    </>
  );

  return (
    <>
      <Header title={note.title} />

      <div className={cn("p-4 sm:p-6 md:p-8 space-y-6 w-full mx-auto", isEditing ? "max-w-6xl pb-28 sm:pb-8" : "max-w-4xl")}>
        {/* Navigation Breadcrumb & Actions Topbar */}
        <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink
                  render={
                    <Link
                      to="/notes"
                      className="text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
                    >
                      Notes
                    </Link>
                  }
                />
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="text-xs font-medium text-foreground max-w-[200px] sm:max-w-xs truncate">
                  {note.title}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Desktop Action Toolbar: Text Alignment, View Switcher & Export Menu */}
          <div className="hidden sm:flex items-center gap-2 flex-wrap">
            {actionToolbarContent}
          </div>
        </div>

        {/* Manual Edit Canvas */}
        {isEditing ? (
          <div className="space-y-5">
            {editMode === "source" && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
              <span className="text-xs font-medium text-muted-foreground">
                Editing note · Markdown
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setEditMode((prev) => (prev === "rich" ? "source" : "rich"))
                  }
                  className="gap-1.5 text-xs min-h-11 sm:min-h-9"
                  aria-label="Switch to rich text editor"
                  title="Switch to rich text editor"
                >
                  <Pencil className="size-3.5" />
                  <span>Rich</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={requestCancelEdit}
                  disabled={isSavingEdit}
                  className="hidden gap-1.5 text-xs min-h-9 sm:inline-flex"
                >
                  <X className="size-3.5" />
                  <span>Cancel</span>
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveEdit}
                  disabled={isSavingEdit || !isDirtyEdit()}
                  className="hidden gap-1.5 text-xs min-h-9 sm:inline-flex"
                >
                  {isSavingEdit ? <Spinner className="size-3.5" /> : <Save className="size-3.5" />}
                  <span>{isSavingEdit ? "Saving…" : "Save"}</span>
                </Button>
              </div>
            </div>
            )}

            <div className="space-y-2">
              <label
                htmlFor="note-edit-title"
                className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Title
              </label>
              <input
                id="note-edit-title"
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                maxLength={300}
                placeholder="Note title"
                className="w-full border-b border-border bg-transparent pb-2 text-2xl font-bold tracking-tight text-foreground outline-none transition-colors focus:border-foreground sm:text-3xl"
              />
            </div>


            {/* Kept mounted while Source is shown so the editor (and its undo
                history) survives the toggle. */}
            <div className={cn(editMode !== "rich" && "hidden")}>
              <NoteRichEditor
                markdown={draftContent}
                onChange={updateDraftContent}
                editable={!isSavingEdit}
                active={editMode === "rich"}
                onSave={handleSaveEdit}
                onCancel={requestCancelEdit}
                onToggleSource={() =>
                  setEditMode((prev) => (prev === "rich" ? "source" : "rich"))
                }
                isSaving={isSavingEdit}
                canSave={isDirtyEdit()}
                sourceLabel={editMode === "rich" ? "Source" : "Rich"}
                onMakeSummary={handleMakeSummary}
                onMakeKeyPoint={handleMakeKeyPoint}
                onMakeActionItem={handleMakeActionItem}
              />
            </div>

            {editMode === "source" && (
              <textarea
                value={draftContent}
                onChange={(event) => updateDraftContent(event.target.value)}
                maxLength={100000}
                spellCheck={false}
                aria-label="Note body in Markdown"
                className="min-h-[45vh] w-full resize-y rounded-xl border border-border bg-muted/20 p-4 font-mono text-xs leading-relaxed text-foreground outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 sm:text-sm"
              />
            )}

            <p className="hidden text-[11px] text-muted-foreground sm:block">
              Draft disimpan otomatis di browser ini. Cmd/Ctrl + Enter untuk simpan, Esc untuk batal.
            </p>

            <Accordion
              multiple
              defaultValue={[] as string[]}
              className="rounded-xl border border-border bg-muted/20 px-3"
            >
            <AccordionItem value="key-points" className="border-b-0">
              <AccordionTrigger className="py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span className="flex items-center gap-2">
                  Key points
                  {effectiveKeyPoints.length > 0 ? `(${effectiveKeyPoints.length})` : "(0)"}
                  {keyPointsOverridden && (
                    <ManualBadge />
                  )}
                </span>
              </AccordionTrigger>
              <AccordionPanel className="pb-3">
              <div className="flex items-center justify-end">
                {keyPointsOverridden && (
                  <button
                    type="button"
                    disabled={keyPointBusy}
                    onClick={() => persistKeyPoints([])}
                    className="text-[11px] font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline disabled:opacity-50"
                  >
                    Kembalikan ke versi AI
                  </button>
                )}
              </div>
              {effectiveKeyPoints.length === 0 ? (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Belum ada key point. Blok teks di editor, lalu klik tombol
                  &ldquo;Key point&rdquo; di toolbar.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {effectiveKeyPoints.map((point, index) => (
                    <li
                      key={`${index}-${point.slice(0, 16)}`}
                      className="flex items-start gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5"
                    >
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground" />
                      <span className="flex-1 text-[12px] leading-relaxed text-foreground/90">
                        {point}
                      </span>
                      <button
                        type="button"
                        aria-label="Hapus key point"
                        disabled={keyPointBusy}
                        onClick={() => handleRemoveKeyPoint(index)}
                        className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              </AccordionPanel>
            </AccordionItem>
            <AccordionItem value="action-items" className="border-b-0">
              <AccordionTrigger className="py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span className="flex items-center gap-2">
                  Action items
                  {actionItems.length > 0 ? `(${actionItems.length})` : "(0)"}
                  {actionItemsOverridden && (
                    <ManualBadge />
                  )}
                </span>
              </AccordionTrigger>
              <AccordionPanel className="pb-3">
              <div className="space-y-2">
                <div className="flex items-center justify-end gap-2">
                  {actionItemsOverridden && (
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => persistActionItems([])}
                      className="text-[11px] font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline disabled:opacity-50"
                    >
                      Kembalikan ke versi AI
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={actionBusy || actionItems.length >= 50}
                    onClick={() =>
                      setActionItems((prev) => [
                        ...prev,
                        { text: "", owner: null, due_date: null, priority: null },
                      ])
                    }
                    className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-border px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    <Plus className="size-3" />
                    <span>Tambah</span>
                  </button>
                </div>
              </div>

              {actionItems.length === 0 ? (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Belum ada action item. Blok teks di editor lalu klik tombol
                  &ldquo;Action&rdquo; di toolbar, atau pakai tombol Tambah.
                </p>
              ) : (
                <ul className="space-y-2">
                  {actionItems.map((item, index) => (
                    <li
                      key={index}
                      className="space-y-2 rounded-lg border border-border bg-background p-2.5"
                    >
                      <div className="flex items-start gap-2">
                        <input
                          value={item.text ?? item.task ?? ""}
                          onChange={(event) =>
                            patchActionItem(index, { text: event.target.value })
                          }
                          onBlur={() => persistActionItems(actionItems)}
                          maxLength={500}
                          placeholder="Apa yang harus dikerjakan"
                          aria-label="Action item"
                          className="min-h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs leading-relaxed text-foreground outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
                        />
                        <button
                          type="button"
                          aria-label="Hapus action item"
                          disabled={actionBusy}
                          onClick={() => handleRemoveActionItem(index)}
                          className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          value={item.owner ?? item.assignee ?? ""}
                          onChange={(event) =>
                            patchActionItem(index, { owner: event.target.value })
                          }
                          onBlur={() => persistActionItems(actionItems)}
                          maxLength={120}
                          placeholder="Owner"
                          aria-label="Owner"
                          className="min-h-8 w-32 rounded-md border border-border bg-background px-2 text-[11px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
                        />
                        <input
                          value={item.due_date ?? item.due_date_text ?? ""}
                          onChange={(event) =>
                            patchActionItem(index, { due_date: event.target.value })
                          }
                          onBlur={() => persistActionItems(actionItems)}
                          maxLength={40}
                          placeholder="Due date"
                          aria-label="Due date"
                          className="min-h-8 w-32 rounded-md border border-border bg-background px-2 font-mono text-[11px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
                        />
                        <select
                          value={(item.priority ?? "").toLowerCase()}
                          onChange={(event) => {
                            const value = event.target.value;
                            const next = actionItems.map((entry, itemIndex) =>
                              itemIndex === index
                                ? { ...entry, priority: value === "" ? null : value }
                                : entry,
                            );
                            setActionItems(next);
                            void persistActionItems(next);
                          }}
                          aria-label="Priority"
                          className="min-h-8 rounded-md border border-border bg-background px-2 text-[11px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
                        >
                          <option value="">No priority</option>
                          <option value="high">High</option>
                          <option value="medium">Medium</option>
                          <option value="low">Low</option>
                        </select>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              </AccordionPanel>
            </AccordionItem>
            </Accordion>
          </div>
        ) : isRawView ? (
          <div className="space-y-4">
            {/* Mobile Action Toolbar when in Raw View */}
            <div className="flex sm:hidden items-center gap-2 justify-start flex-wrap">
              {actionToolbarContent}
            </div>
            <div className="p-5 sm:p-8 font-mono text-xs sm:text-sm leading-relaxed whitespace-pre-wrap text-foreground bg-muted/20 border border-border rounded-xl">
              {getEffectiveMarkdown()}
            </div>
          </div>
        ) : (
          /* Single Continuous Notion-Style Document Canvas (Flat on Page, No Card Box) */
          <article className="w-full max-w-3xl mx-auto py-2 sm:py-6 space-y-8 transition-colors">
            {/* Notion Page Title */}
            <div className="space-y-4">
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground leading-tight font-heading">
                {note.title}
              </h1>

              {manualEditText && (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="gap-1 text-[10px]">
                    <Pencil className="size-3" />
                    <span>Edited manually</span>
                  </Badge>
                </div>
              )}

              {/* Mobile Compact Metadata Bar: Centered, Equal-Width Grid */}
              <div
                className={cn(
                  "grid sm:hidden items-center divide-x divide-border bg-muted/30 border border-border rounded-xl p-1",
                  hasTags ? "grid-cols-4" : "grid-cols-3",
                )}
              >
                {/* Created */}
                <div className="flex items-center justify-center min-w-0">
                  <Popover>
                    <PopoverTrigger
                      openOnHover
                      className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer py-1.5 px-1 rounded-lg hover:bg-muted/50 active:bg-muted truncate"
                    >
                      <Calendar className="size-3.5 shrink-0" />
                      <span className="truncate">Created</span>
                    </PopoverTrigger>
                    <PopoverPopup
                      side="bottom"
                      align="center"
                      sideOffset={6}
                      className="w-56 text-xs [--viewport-inline-padding:--spacing(3.5)] [&_[data-slot=popover-viewport]]:py-3"
                    >
                      <div className="space-y-1">
                        <div className="font-semibold text-foreground">Date Created</div>
                        <div className="text-muted-foreground">{formatDate(note.created_at)}</div>
                        <div className="text-[11px] text-muted-foreground/80">{formatRelativeTime(note.created_at)}</div>
                      </div>
                    </PopoverPopup>
                  </Popover>
                </div>

                {/* Source */}
                <div className="flex items-center justify-center min-w-0">
                  <Popover>
                    <PopoverTrigger
                      openOnHover
                      className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer py-1.5 px-1 rounded-lg hover:bg-muted/50 active:bg-muted truncate"
                    >
                      <SourceIcon className="size-3.5 shrink-0" />
                      <span className="truncate">Source</span>
                    </PopoverTrigger>
                    <PopoverPopup
                      side="bottom"
                      align="center"
                      sideOffset={6}
                      className="w-56 text-xs [--viewport-inline-padding:--spacing(3.5)] [&_[data-slot=popover-viewport]]:py-3"
                    >
                      <div className="space-y-1.5">
                        <div className="font-semibold text-foreground">Capture Source</div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{SOURCE_LABELS[note.source_type] ?? note.source_type}</span>
                          {note.is_saved ? (
                            <Badge variant="secondary" className="gap-1 text-[10px]">
                              <BookmarkCheck className="size-3 text-foreground" />
                              <span>Saved</span>
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1 text-[10px]">
                              <Bookmark className="size-3" />
                              <span>Draft</span>
                            </Badge>
                          )}
                        </div>
                      </div>
                    </PopoverPopup>
                  </Popover>
                </div>

                {/* Template */}
                <div className="flex items-center justify-center min-w-0">
                  <Popover>
                    <PopoverTrigger
                      openOnHover
                      className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer py-1.5 px-1 rounded-lg hover:bg-muted/50 active:bg-muted truncate"
                    >
                      <FileText className="size-3.5 shrink-0" />
                      <span className="truncate">Template</span>
                    </PopoverTrigger>
                    <PopoverPopup
                      side="bottom"
                      align="center"
                      sideOffset={6}
                      className="w-56 text-xs [--viewport-inline-padding:--spacing(3.5)] [&_[data-slot=popover-viewport]]:py-3"
                    >
                      <div className="space-y-1">
                        <div className="font-semibold text-foreground">Note Template</div>
                        <div className="font-mono text-muted-foreground">{note.template_key}</div>
                      </div>
                    </PopoverPopup>
                  </Popover>
                </div>

                {/* Tags */}
                {hasTags && (
                  <div className="flex items-center justify-center min-w-0">
                    <Popover>
                      <PopoverTrigger
                        openOnHover
                        className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer py-1.5 px-1 rounded-lg hover:bg-muted/50 active:bg-muted truncate"
                      >
                        <Tag className="size-3.5 shrink-0" />
                        <span className="truncate">Tags</span>
                      </PopoverTrigger>
                      <PopoverPopup
                        side="bottom"
                        align="end"
                        sideOffset={6}
                        className="w-64 text-xs [--viewport-inline-padding:--spacing(3.5)] [&_[data-slot=popover-viewport]]:py-3"
                      >
                        <div className="space-y-2">
                          <div className="font-semibold text-foreground">Tags ({note.tags?.length})</div>
                          <div className="flex flex-wrap gap-1.5">
                            {note.tags?.map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-[10px] font-normal">
                                #{tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </PopoverPopup>
                    </Popover>
                  </div>
                )}
              </div>

              {/* Mobile Action Toolbar: Left-aligned, positioned below metadata bar */}
              <div className="flex sm:hidden items-center gap-2 justify-start flex-wrap pt-0.5">
                {actionToolbarContent}
              </div>

              {/* Desktop Notion Property Table */}
              <div className="hidden sm:grid grid-cols-[120px_1fr] gap-y-2.5 gap-x-4 text-xs pt-2">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="size-3.5" />
                  <span>Created</span>
                </div>
                <div className="text-foreground font-medium">
                  {formatDate(note.created_at)}
                </div>

                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <SourceIcon className="size-3.5" />
                  <span>Source</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-foreground font-medium">
                    {SOURCE_LABELS[note.source_type] ?? note.source_type}
                  </span>
                  {note.is_saved ? (
                    <Badge variant="secondary" className="gap-1 text-[10px]">
                      <BookmarkCheck className="size-3 text-foreground" />
                      <span>Saved</span>
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1 text-[10px]">
                      <Bookmark className="size-3" />
                      <span>Draft</span>
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <FileText className="size-3.5" />
                  <span>Template</span>
                </div>
                <div className="font-mono text-muted-foreground">
                  {note.template_key}
                </div>

                {note.tags && note.tags.length > 0 && (
                  <>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Tag className="size-3.5" />
                      <span>Tags</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {note.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[11px] font-normal">
                          #{tag}
                        </Badge>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            <hr className="border-border" />

            {/* Document Content Flow (Flat on Canvas, Notion Style) */}
            {manualEditText ? (
              <div className="space-y-6 px-3 sm:px-4">
                {effectiveSummary && (
                  <div className="rounded-lg border border-border bg-muted/40 p-4 text-foreground text-sm sm:text-base leading-relaxed">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        <span>Summary</span>
                        {summaryOverridden && (
                          <ManualBadge />
                        )}
                      </div>
                      <p className={cn("text-foreground/90 leading-relaxed font-sans", textAlignClass)}>
                        {effectiveSummary}
                      </p>
                    </div>
                  </div>
                )}
                <div>
                <div
                  className={cn(
                    "text-sm sm:text-base leading-relaxed text-foreground/90 font-sans prose prose-neutral dark:prose-invert max-w-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1.5 [&_p]:my-3 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg [&_h3]:font-semibold [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-muted [&_code]:font-mono [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:bg-muted/70 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:italic",
                    textAlignClass,
                  )}
                  dangerouslySetInnerHTML={{ __html: renderMarkdownHtml(flatBodyMarkdown) }}
                />
                </div>
                {keyPointsOverridden && keyPointsBlock}
                {actionItemsOverridden && actionItemsBlock}
              </div>
            ) : (
            <div className="space-y-8">
              {/* Summary as Notion Callout without Icon */}
              {effectiveSummary && (
                <div className="rounded-lg border border-border bg-muted/40 p-4 text-foreground text-sm sm:text-base leading-relaxed">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <span>Summary</span>
                      {summaryOverridden && (
                        <ManualBadge />
                      )}
                    </div>
                    <p className={cn("text-foreground/90 leading-relaxed font-sans", textAlignClass)}>
                      {effectiveSummary}
                    </p>
                  </div>
                </div>
              )}

              {/* Note Content Below Summary with Extra Horizontal Breathing Room */}
              <div className="px-3 sm:px-4 space-y-8">
                {/* Additional Sections (Rendered with Markdown -> HTML) */}
                {content?.sections && content.sections.length > 0 && (
                <div className="space-y-8 pt-2">
                  {content.sections.map((section, i) => {
                    const bodyText = section.content || section.body || "";
                    return (
                      <section key={i} className="space-y-3">
                        <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground font-heading">
                          {section.heading}
                        </h2>
                        {bodyText ? (
                          <div
                            className={cn(
                              "text-sm sm:text-base leading-relaxed text-foreground/90 font-sans prose prose-neutral dark:prose-invert max-w-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1.5 [&_p]:my-2 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-muted [&_code]:font-mono [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:bg-muted/70 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:italic",
                              textAlignClass,
                            )}
                            dangerouslySetInnerHTML={{ __html: renderMarkdownHtml(bodyText) }}
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground/60 italic">
                            No additional details recorded.
                          </p>
                        )}
                      </section>
                    );
                  })}
                </div>
              )}

              {/* Key Points with Notion Bullets */}
              {keyPointsBlock}

              {/* Decisions (if present) */}
              {content?.decisions && content.decisions.length > 0 && (
                <section className="space-y-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <CheckCircle2 className="size-3.5" />
                    <span>Decisions ({content.decisions.length})</span>
                  </h2>
                  <ul className="space-y-2 pl-1">
                    {content.decisions.map((decision, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm sm:text-base text-foreground leading-relaxed">
                        <span className="text-foreground/70 font-bold select-none">•</span>
                        <span className={cn("flex-1 leading-relaxed", textAlignClass)}>{decision}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Action Items with Notion Interactive Checkboxes */}
              {actionItemsBlock}

              {/* Source References */}
              {content?.source_references && content.source_references.length > 0 && (
                <section className="space-y-2 pt-6 border-t border-border">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Sources & References
                  </h3>
                  <ul className="space-y-1.5 text-xs text-muted-foreground">
                    {content.source_references.map((ref, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="font-mono text-muted-foreground/70">[{i + 1}]</span>
                        {ref.url ? (
                          <a
                            href={ref.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-foreground hover:underline underline-offset-2 font-medium"
                          >
                            {ref.title || ref.url}
                          </a>
                        ) : (
                          <span>{ref.title || ref.value}</span>
                        )}
                        {ref.page && <span>(p. {ref.page})</span>}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              </div>
            </div>
            )}
          </article>
        )}
      </div>

      {/* Mobile sticky save bar while editing */}
      {isEditing && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-border bg-background/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:hidden">
          <Button
            variant="outline"
            onClick={requestCancelEdit}
            disabled={isSavingEdit}
            className="min-h-11 flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveEdit}
            disabled={isSavingEdit || !isDirtyEdit()}
            className="min-h-11 flex-1 gap-1.5"
          >
            {isSavingEdit ? <Spinner className="size-3.5" /> : <Save className="size-3.5" />}
            <span>{isSavingEdit ? "Saving…" : "Save"}</span>
          </Button>
        </div>
      )}

      {/* Discard Unsaved Edit Dialog */}
      <AlertDialog open={discardDialogOpen} onOpenChange={setDiscardDialogOpen}>
        <AlertDialogPopup className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your edits to this note have not been saved. Leaving now will drop them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDiscardDialogOpen(false)}>
              Keep editing
            </Button>
            <Button variant="destructive" size="sm" onClick={finishCancelEdit}>
              Discard
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

      {id && (
        <NoteVersionHistory
          noteId={id}
          currentOutputId={noteRecord?.output_id ?? null}
          open={versionDialogOpen}
          onOpenChange={setVersionDialogOpen}
          onRestored={fetchNote}
        />
      )}

      {/* Change Template Dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogPopup className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <span>Change note template</span>
            </DialogTitle>
            <DialogDescription>
              Choose a new template to restructure this note. The original transcript
              will be reprocessed by AI.
            </DialogDescription>
            <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
              Regenerate memakai <strong>1 kuota generasi</strong>. Versi lama tidak
              hilang — bisa dikembalikan lewat Riwayat versi kapan saja.
            </p>
          </DialogHeader>

          <div className="p-6 pt-2 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">Choose template</label>
              <Select
                value={selectedTemplateKey}
                onValueChange={(val) => val && setSelectedTemplateKey(val)}
                disabled={isRegenerating}
              >
                <SelectTrigger className="w-full text-xs">
                  <SelectValue>
                    {templates.find((t) => t.template_key === selectedTemplateKey)?.template_name || selectedTemplateKey}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup className="max-h-60">
                  {templates.map((t) => (
                    <SelectItem key={t.template_key} value={t.template_key}>
                      <div className="flex flex-col py-0.5">
                        <span className="font-medium text-xs">{t.template_name}</span>
                        {t.description && (
                          <span className="text-[10px] text-muted-foreground line-clamp-1">{t.description}</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>
          </div>

          <DialogFooter className="p-4 border-t border-border flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTemplateDialogOpen(false)}
              disabled={isRegenerating}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleRegenerate}
              disabled={isRegenerating}
              className="gap-1.5"
            >
              {isRegenerating ? (
                <>
                  <Spinner className="size-3.5" />
                  <span>Processing…</span>
                </>
              ) : (
                <>
                  <Sparkles className="size-3.5" />
                  <span>Regenerate</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      {/* Delete Note Alert Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogPopup className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="size-4" />
              <span>Delete this note?</span>
            </AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The note and its full generation and export history will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteNote}
              disabled={isDeleting}
              className="gap-1.5"
            >
              {isDeleting ? (
                <>
                  <Spinner className="size-3.5" />
                  <span>Deleting…</span>
                </>
              ) : (
                <>
                  <Trash2 className="size-3.5" />
                  <span>Delete note</span>
                </>
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
