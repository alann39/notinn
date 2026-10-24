import { useEffect, useState, useCallback } from "react";
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
import { toastManager } from "@/components/ui/toast";
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
  Image,
  Loader2,
  Mic,
  Pencil,
  Save,
  X,
  Tag,
  CheckSquare,
  List,
  Sparkles,
  Trash2,
} from "lucide-react";
import { formatDate, formatRelativeTime } from "@/lib/utils";
import type { Note, StructuredNote } from "@/types/notes";
import { cn } from "@/lib/utils";
import { exportNoteToPdf } from "@/lib/pdf-export";

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
  const rawHtml = marked.parse(markdownText, { async: false }) as string;
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
  const [showDraftPreview, setShowDraftPreview] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);

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
  }) | null;

  const manualEditText = noteRecord?.manual_edit_rendered_text ?? null;

  const rawContent = noteRecord?.output_content_json || note?.current_output?.content_json;
  const renderedText = noteRecord?.output_rendered_text || note?.current_output?.rendered_text;

  // Ensure we always have content to display in the structured view, even if it's just renderedText
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

  const isDirtyEdit =
    isEditing && note
      ? draftTitle.trim() !== note.title.trim() || draftContent !== baselineContent
      : false;

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
    setDraftContent(nextContent);
    setIsEditing(true);
    setIsRawView(false);
    setShowDraftPreview(false);
  };

  const finishCancelEdit = () => {
    clearStoredDraft();
    setDiscardDialogOpen(false);
    setIsEditing(false);
    setShowDraftPreview(false);
  };

  const requestCancelEdit = () => {
    if (isDirtyEdit) {
      setDiscardDialogOpen(true);
      return;
    }
    finishCancelEdit();
  };

  const handleSaveEdit = async () => {
    if (!id) return;
    const nextTitle = draftTitle.trim();
    const nextContent = draftContent.trim();
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
      setShowDraftPreview(false);
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

  const handleDownloadPdf = async () => {
    if (!note) return;
    setIsExportingPdf(true);
    try {
      const structuredData: StructuredNote = content ?? {
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

      const { filename, blob } = await exportNoteToPdf(structuredData);
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
          <MenuPopup align="end" className="w-52">
            <MenuItem
              onClick={handleDownloadPdf}
              disabled={isExportingPdf}
              className="cursor-pointer gap-2.5 text-xs py-2"
            >
              <FileIcon className="size-4 text-muted-foreground" />
              <div className="flex flex-col">
                <span className="font-medium">Export PDF Document</span>
                <span className="text-[10px] text-muted-foreground">Formatted printable .pdf</span>
              </div>
            </MenuItem>

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

      <div className={cn("p-4 sm:p-6 md:p-8 space-y-6 max-w-4xl w-full mx-auto", isEditing && "pb-28 sm:pb-8")}>
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
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
              <span className="text-xs font-medium text-muted-foreground">
                Editing note · Markdown
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDraftPreview((prev) => !prev)}
                  className="gap-1.5 text-xs min-h-9"
                  aria-label={showDraftPreview ? "Back to Markdown source" : "Preview rendered Markdown"}
                >
                  {showDraftPreview ? <Pencil className="size-3.5" /> : <FileText className="size-3.5" />}
                  <span>{showDraftPreview ? "Source" : "Preview"}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={requestCancelEdit}
                  disabled={isSavingEdit}
                  className="gap-1.5 text-xs min-h-9"
                >
                  <X className="size-3.5" />
                  <span>Cancel</span>
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveEdit}
                  disabled={isSavingEdit}
                  className="gap-1.5 text-xs min-h-9"
                >
                  {isSavingEdit ? <Spinner className="size-3.5" /> : <Save className="size-3.5" />}
                  <span>{isSavingEdit ? "Saving…" : "Save"}</span>
                </Button>
              </div>
            </div>

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

            {showDraftPreview ? (
              <div
                className={cn(
                  "min-h-[45vh] rounded-xl border border-border bg-muted/10 p-5 font-sans text-sm leading-relaxed text-foreground/90 prose prose-neutral dark:prose-invert max-w-none sm:p-8 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1.5 [&_p]:my-2 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-muted [&_code]:font-mono [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:bg-muted/70 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:italic",
                  textAlignClass,
                )}
                dangerouslySetInnerHTML={{ __html: renderMarkdownHtml(draftContent) }}
              />
            ) : (
              <textarea
                value={draftContent}
                onChange={(event) => setDraftContent(event.target.value)}
                maxLength={100000}
                spellCheck={false}
                aria-label="Note body in Markdown"
                className="min-h-[45vh] w-full resize-y rounded-xl border border-border bg-muted/20 p-4 font-mono text-xs leading-relaxed text-foreground outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 sm:text-sm"
              />
            )}

            <p className="text-[11px] text-muted-foreground">
              Draft disimpan otomatis di browser ini. Cmd/Ctrl + Enter untuk simpan, Esc untuk batal.
            </p>
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
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground leading-tight font-sans">
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
              <div className="px-3 sm:px-4">
                <div
                  className={cn(
                    "text-sm sm:text-base leading-relaxed text-foreground/90 font-sans prose prose-neutral dark:prose-invert max-w-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1.5 [&_p]:my-3 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg [&_h3]:font-semibold [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-muted [&_code]:font-mono [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:bg-muted/70 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:italic",
                    textAlignClass,
                  )}
                  dangerouslySetInnerHTML={{ __html: renderMarkdownHtml(manualEditText) }}
                />
              </div>
            ) : (
            <div className="space-y-8">
              {/* Summary as Notion Callout without Icon */}
              {content?.summary && (
                <div className="rounded-lg border border-border bg-muted/40 p-4 text-foreground text-sm sm:text-base leading-relaxed">
                  <div className="space-y-1">
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Summary
                    </div>
                    <p className={cn("text-foreground/90 leading-relaxed font-sans", textAlignClass)}>
                      {content.summary}
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
                        <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground font-sans">
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
              {content?.key_points && content.key_points.length > 0 && (
                <section className="space-y-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <List className="size-3.5" />
                    <span>Key Points</span>
                  </h2>
                  <ul className="space-y-2 pl-1">
                    {content.key_points.map((point, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm sm:text-base text-foreground leading-relaxed">
                        <span className="text-foreground/70 font-bold select-none">•</span>
                        <span className={cn("flex-1 leading-relaxed", textAlignClass)}>{point}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

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
              {content?.action_items && content.action_items.length > 0 && (
                <section className="space-y-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <CheckSquare className="size-3.5" />
                    <span>Action Items ({content.action_items.length})</span>
                  </h2>
                  <div className="space-y-2 pl-1">
                    {content.action_items.map((item, i) => {
                      const isChecked = !!checkedItems[i];
                      const taskText = item.task || item.text || "";
                      const dueDate = item.due_date || item.due_date_text || item.due_date_iso;
                      const assignee = item.owner || item.assignee;

                      return (
                        <div
                          key={i}
                          className="flex items-start gap-3 py-1 text-sm sm:text-base group"
                        >
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
                                {item.priority && (
                                  <Badge
                                    variant={item.priority.toLowerCase() === "high" ? "default" : "secondary"}
                                    className="text-[10px] uppercase font-semibold"
                                  >
                                    {item.priority}
                                  </Badge>
                                )}
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
              )}

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
          <Button onClick={handleSaveEdit} disabled={isSavingEdit} className="min-h-11 flex-1 gap-1.5">
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

      {/* Change Template Dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogPopup className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <span>Change note template</span>
            </DialogTitle>
            <DialogDescription>
              Choose a new template to restructure this note. The original transcript will be reprocessed by AI.
            </DialogDescription>
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
