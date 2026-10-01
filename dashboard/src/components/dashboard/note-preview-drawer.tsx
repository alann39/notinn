import { useState, useEffect, useCallback } from "react";
import {
  FileEdit,
  Save,
  Trash2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Calendar,
  CheckSquare,
  List,
  AlertCircle,
  FileText,
  Mic,
  Clock,
  ExternalLink,
  BookmarkCheck,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase, SUPABASE_URL } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Sheet,
  SheetPopup,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetPanel,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Drawer,
  DrawerPopup,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerPanel,
  DrawerFooter,
} from "@/components/ui/drawer";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
  SelectGroup,
  SelectGroupLabel,
  SelectSeparator,
} from "@/components/ui/select";
import { toastManager } from "@/components/ui/toast";
import { useIsMobile } from "@/hooks/use-media-query";
import { formatRelativeTime, cn } from "@/lib/utils";
import type { Note, StructuredNote } from "@/types/notes";

export interface TemplateOption {
  template_key: string;
  template_name: string;
  description: string;
  is_custom: boolean;
  is_default: boolean;
}

interface NotePreviewDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteId: string | null;
  onSaved?: (noteId: string) => void;
  onDeleted?: (noteId: string) => void;
  onRegenerated?: (noteId: string) => void;
}

export function NotePreviewDrawer({
  open,
  onOpenChange,
  noteId,
  onSaved,
  onDeleted,
  onRegenerated,
}: NotePreviewDrawerProps) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [note, setNote] = useState<Note | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExpandedTranscript, setIsExpandedTranscript] = useState(false);
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>("clean_note");

  // Fetch note and templates
  const fetchNote = useCallback(async () => {
    if (!noteId) {
      setNote(null);
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc("web_get_note", { p_note_id: noteId });
      if (error) throw error;
      const fetchedNote = Array.isArray(data) ? (data[0] as Note) : (data as Note);
      setNote(fetchedNote || null);
      if (fetchedNote?.template_key) {
        setSelectedTemplateKey(fetchedNote.template_key);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not load note";
      toastManager.add({
        title: "Could not load note",
        description: msg,
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  }, [noteId]);

  const fetchTemplates = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc("web_list_templates", { p_input_type: "audio" });
      if (error) return;
      const opts = (data as TemplateOption[]) || [];
      setTemplates(opts);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (open && noteId) {
      fetchNote();
      fetchTemplates();
      setIsExpandedTranscript(false);
    }
  }, [open, noteId, fetchNote, fetchTemplates]);

  const handleCopyTranscript = () => {
    if (!note?.transcript) return;
    navigator.clipboard.writeText(note.transcript);
    setCopiedTranscript(true);
    toastManager.add({
      title: "Transcript copied",
      description: "Transcript copied to clipboard.",
      type: "success",
    });
    setTimeout(() => setCopiedTranscript(false), 2000);
  };

  const handleToggleSave = async () => {
    if (!noteId) return;
    const newSaved = !note?.is_saved;
    setIsSaving(true);
    try {
      const { data, error } = await supabase.rpc("web_set_note_saved", {
        p_note_id: noteId,
        p_is_saved: newSaved,
      });
      if (error) throw error;
      if (data) {
        toastManager.add({
          title: newSaved ? "Note saved" : "Save removed",
          description: newSaved
            ? "Note added to your saved list."
            : "Note is now a draft.",
          type: "success",
        });
        await fetchNote();
        onSaved?.(noteId);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not save note";
      toastManager.add({
        title: "Could not save note",
        description: msg,
        type: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!noteId) return;
    setIsDeleting(true);
    try {
      const { data, error } = await supabase.rpc("web_delete_note", { p_note_id: noteId });
      if (error) throw error;
      if (data) {
        toastManager.add({
          title: "Note deleted",
          description: note?.is_saved
            ? "Note permanently deleted."
            : "Draft permanently deleted.",
          type: "success",
        });
        onDeleted?.(noteId);
        onOpenChange(false);
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

  const handleRegenerate = async () => {
    if (!noteId || !selectedTemplateKey) return;
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
          note_id: noteId,
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

      await fetchNote();
      onRegenerated?.(noteId);
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

  const customTemplates = templates.filter((t) => t.is_custom);
  const systemTemplates = templates.filter((t) => !t.is_custom);
  const activeTemplate = templates.find((t) => t.template_key === selectedTemplateKey);

  const structuredContent: StructuredNote | null = note?.output_content_json || null;

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <Spinner className="size-6 text-primary" />
          <p className="text-xs">Loading draft note…</p>
        </div>
      );
    }

    if (!note) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
          <AlertCircle className="size-8 text-muted-foreground/60" />
          <p className="text-sm font-medium">Note not found</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Transcript Box */}
        {note.transcript && note.transcript.trim().length > 0 && (
          <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <Mic className="size-3.5 text-primary" />
                Voice transcript
              </span>
              <button
                type="button"
                onClick={handleCopyTranscript}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-0.5 rounded border border-border bg-background cursor-pointer"
              >
                {copiedTranscript ? (
                  <>
                    <Check className="size-3 text-emerald-500" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-3" />
                    <span>Copy transcript</span>
                  </>
                )}
              </button>
            </div>

            <div className="relative">
              <div
                className={cn(
                  "text-xs text-muted-foreground leading-relaxed font-sans whitespace-pre-wrap transition-all",
                  !isExpandedTranscript ? "max-h-24 overflow-hidden relative" : "max-h-96 overflow-y-auto"
                )}
              >
                {note.transcript}
              </div>
              {!isExpandedTranscript && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-muted/90 to-transparent" />
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsExpandedTranscript(!isExpandedTranscript)}
              className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline pt-1 cursor-pointer"
            >
              {isExpandedTranscript ? (
                <>
                  <ChevronUp className="size-3.5" />
                  <span>Collapse transcript</span>
                </>
              ) : (
                <>
                  <ChevronDown className="size-3.5" />
                  <span>Show more</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Structured Document Content */}
        {structuredContent ? (
          <div className="space-y-5 text-sm">
            {/* Summary */}
            {structuredContent.summary && (
              <div className="rounded-xl border border-border/80 bg-card p-4 space-y-1.5">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <FileText className="size-3.5 text-primary" />
                  Executive summary
                </h4>
                <p className="text-sm leading-relaxed text-foreground">
                  {structuredContent.summary}
                </p>
              </div>
            )}

            {/* Key Points */}
            {structuredContent.key_points && structuredContent.key_points.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <List className="size-3.5 text-primary" />
                  Key points
                </h4>
                <ul className="space-y-1.5 text-sm">
                  {structuredContent.key_points.map((point, i) => (
                    <li key={i} className="flex items-start gap-2 text-foreground/90 leading-relaxed">
                      <span className="size-1.5 rounded-full bg-primary mt-2 shrink-0" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Action Items */}
            {structuredContent.action_items && structuredContent.action_items.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <CheckSquare className="size-3.5 text-primary" />
                  Follow-ups and tasks
                </h4>
                <div className="space-y-1.5">
                  {structuredContent.action_items.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs"
                    >
                      <input
                        type="checkbox"
                        disabled
                        className="size-3.5 rounded border-muted-foreground/40 mt-0.5"
                      />
                      <div className="flex-1 space-y-0.5">
                        <p className="font-medium text-foreground">{item.task || item.text}</p>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                          {(item.assignee || item.owner) && (
                            <span>Owner: {item.assignee || item.owner}</span>
                          )}
                          {(item.due_date || item.due_date_text || item.due_date_iso) && (
                            <span className="flex items-center gap-1">
                              <Calendar className="size-3" />
                              {item.due_date || item.due_date_text || item.due_date_iso}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sections */}
            {structuredContent.sections && structuredContent.sections.length > 0 && (
              <div className="space-y-4 pt-2">
                {structuredContent.sections.map((section, idx) => (
                  <div key={idx} className="space-y-1.5 border-t border-border/50 pt-3">
                    <h5 className="font-semibold text-foreground text-sm">{section.heading}</h5>
                    <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                      {section.body || section.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : note.output_rendered_text ? (
          <div
            className="text-xs leading-relaxed text-foreground whitespace-pre-wrap space-y-2"
            dangerouslySetInnerHTML={{ __html: note.output_rendered_text }}
          />
        ) : (
          <p className="text-xs text-muted-foreground italic">Note content is not available yet.</p>
        )}
      </div>
    );
  };

  const renderFooter = () => {
    return (
      <div className="flex flex-col gap-3 w-full">
        {/* Template Selector Row */}
        <div className="flex items-center gap-2 p-2 rounded-xl border border-border bg-background">
          <div className="flex-1">
            <Select
              value={selectedTemplateKey}
              onValueChange={(val) => val && setSelectedTemplateKey(val)}
              disabled={isRegenerating || isLoading}
            >
              <SelectTrigger className="w-full text-xs h-8">
                <SelectValue>
                  {activeTemplate?.template_name || selectedTemplateKey}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup className="max-h-60">
                {customTemplates.length > 0 && (
                  <SelectGroup>
                    <SelectGroupLabel>Custom Templates</SelectGroupLabel>
                    {customTemplates.map((t) => (
                      <SelectItem key={t.template_key} value={t.template_key}>
                        {t.template_name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {customTemplates.length > 0 && systemTemplates.length > 0 && (
                  <SelectSeparator />
                )}
                <SelectGroup>
                  {customTemplates.length > 0 && (
                    <SelectGroupLabel>System Templates</SelectGroupLabel>
                  )}
                  {systemTemplates.map((t) => (
                    <SelectItem key={t.template_key} value={t.template_key}>
                      {t.template_name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectPopup>
            </Select>
          </div>

          <Button
            size="sm"
            variant="outline"
            className="text-xs h-8 gap-1.5 shrink-0"
            disabled={isRegenerating || isLoading}
            onClick={handleRegenerate}
          >
            {isRegenerating ? (
              <>
                <Spinner className="size-3.5" />
                <span>Processing…</span>
              </>
            ) : (
              <>
                <Sparkles className="size-3.5 text-primary" />
                <span>Change template</span>
              </>
            )}
          </Button>
        </div>

        {/* Primary Action Buttons */}
        {/* Primary Action Buttons */}
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="destructive"
            size="sm"
            className="text-xs h-9 gap-1.5"
            disabled={isDeleting || isSaving || isRegenerating}
            onClick={handleDelete}
          >
            {isDeleting ? <Spinner className="size-3.5" /> : <Trash2 className="size-3.5" />}
            <span>{note?.is_saved ? "Delete note" : "Delete draft"}</span>
          </Button>

          <div className="flex items-center gap-2">
            {note?.id && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-9 gap-1.5"
                onClick={() => {
                  onOpenChange(false);
                  navigate(`/notes/${note.id}`);
                }}
              >
                <ExternalLink className="size-3.5" />
                <span>Open document</span>
              </Button>
            )}

            <Button
              variant={note?.is_saved ? "outline" : "default"}
              size="sm"
              className={cn(
                "text-xs h-9 gap-1.5 font-medium",
                note?.is_saved &&
                  "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20",
              )}
              disabled={isSaving || isDeleting || isRegenerating}
              onClick={handleToggleSave}
            >
              {isSaving ? (
                <Spinner className="size-3.5" />
              ) : note?.is_saved ? (
                <BookmarkCheck className="size-3.5" />
              ) : (
                <Save className="size-3.5" />
              )}
              <span>{note?.is_saved ? "Note saved" : "Save note"}</span>
            </Button>
          </div>
        </div>
      </div>
    );
  };

  if (!isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetPopup side="right" className="sm:max-w-xl w-full flex flex-col">
          <SheetHeader className="px-6 pt-5 pb-3 border-b border-border">
            <div className="flex items-center justify-between gap-2">
              <SheetTitle className="text-base font-semibold truncate flex items-center gap-2">
                <span className="truncate">{note?.title || "Note preview"}</span>
              </SheetTitle>
              {note && !note.is_saved && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20 shrink-0">
                  <FileEdit className="size-3" />
                  Draft
                </span>
              )}
            </div>
            <SheetDescription className="text-xs flex items-center gap-3 pt-1 text-muted-foreground">
              {note?.source_type && (
                <span className="capitalize">{note.source_type}</span>
              )}
              {note?.created_at && (
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />
                  {formatRelativeTime(note.created_at)}
                </span>
              )}
            </SheetDescription>
          </SheetHeader>

          <SheetPanel className="p-6 flex-1 overflow-y-auto">
            {renderContent()}
          </SheetPanel>

          <SheetFooter className="p-4 border-t border-border bg-card/60">
            {renderFooter()}
          </SheetFooter>
        </SheetPopup>
      </Sheet>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerPopup position="bottom" className="max-h-[92vh] flex flex-col">
        <DrawerHeader className="px-5 pt-4 pb-3 border-b border-border">
          <div className="flex items-center justify-between gap-2">
            <DrawerTitle className="text-base font-semibold truncate flex items-center gap-2">
              <span className="truncate">{note?.title || "Note preview"}</span>
            </DrawerTitle>
            {note && !note.is_saved && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20 shrink-0">
                <FileEdit className="size-3" />
                Draft
              </span>
            )}
          </div>
          <DrawerDescription className="text-xs flex items-center gap-3 pt-1 text-muted-foreground">
            {note?.source_type && (
              <span className="capitalize">{note.source_type}</span>
            )}
            {note?.created_at && (
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {formatRelativeTime(note.created_at)}
              </span>
            )}
          </DrawerDescription>
        </DrawerHeader>

        <DrawerPanel className="p-5 flex-1 overflow-y-auto">
          {renderContent()}
        </DrawerPanel>

        <DrawerFooter className="p-4 border-t border-border bg-card/60">
          {renderFooter()}
        </DrawerFooter>
      </DrawerPopup>
    </Drawer>
  );
}
