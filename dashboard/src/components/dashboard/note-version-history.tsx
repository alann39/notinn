import { useCallback, useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { supabase } from "@/lib/supabase";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { toastManager } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/utils";
import { Check, Archive, RotateCcw } from "lucide-react";

export type NoteVersion = {
  output_id: string;
  template_key: string;
  generation_reason: string;
  created_at: string;
  is_current: boolean;
  rendered_text: string;
};

type NoteVersionHistoryProps = {
  noteId: string;
  /** Current output id, so the list can mark which version is live. */
  currentOutputId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestored: () => void;
};

const REASON_LABEL: Record<string, string> = {
  initial: "Generasi awal",
  regenerate: "Regenerate",
  shorter: "Dipadatkan",
  detailed: "Diperluas",
  custom: "Kustom",
};

function renderMarkdown(markdown: string): string {
  if (!markdown) return "";
  const raw = marked.parse(markdown, { async: false }) as string;
  return DOMPurify.sanitize(raw);
}

/**
 * Version history for a note. The list is backed by `web_list_note_outputs`
 * and restore is backed by `web_restore_note_output`; both RPCs ship with the
 * versioning migration. Until that migration is applied the panel renders its
 * empty state instead of inventing rows.
 */
export function NoteVersionHistory({
  noteId,
  currentOutputId,
  open,
  onOpenChange,
  onRestored,
}: NoteVersionHistoryProps) {
  const [versions, setVersions] = useState<NoteVersion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("web_list_note_outputs", {
        p_note_id: noteId,
      });
      if (error) {
        setUnavailable(true);
        setVersions([]);
        return;
      }
      const rows = (Array.isArray(data) ? data : []) as NoteVersion[];
      setVersions(rows);
      setUnavailable(false);
      setSelectedId((prev) => prev ?? rows[0]?.output_id ?? null);
    } catch {
      setUnavailable(true);
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }, [noteId]);

  useEffect(() => {
    if (open && versions === null) void load();
  }, [open, versions, load]);

  const selected = useMemo(
    () => versions?.find((version) => version.output_id === selectedId) ?? null,
    [versions, selectedId],
  );

  const handleRestore = async (version: NoteVersion) => {
    setRestoringId(version.output_id);
    try {
      const { data, error } = await supabase.rpc("web_restore_note_output", {
        p_note_id: noteId,
        p_output_id: version.output_id,
      });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as { outcome?: string } | null;
      if (row?.outcome !== "restored") {
        throw new Error(
          row?.outcome === "not_found"
            ? "Versi ini tidak ditemukan untuk catatan ini."
            : "Gagal mengembalikan versi.",
        );
      }
      toastManager.add({
        title: "Versi dikembalikan",
        description: "Catatan sekarang memakai isi versi yang dipilih.",
        type: "success",
      });
      onOpenChange(false);
      onRestored();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Gagal mengembalikan versi.";
      toastManager.add({ title: "Tidak bisa restore", description: message, type: "error" });
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="size-4" />
            <span>Versi catatan</span>
          </DialogTitle>
          <DialogDescription>
            Setiap regenerate menyimpan versi baru. Pilih salah satu untuk melihat
            isinya, lalu kembalikan kalau lebih baik dari yang sekarang.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 px-6 pb-6 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
          <div className="max-h-72 space-y-1.5 overflow-y-auto rounded-xl border border-border p-1.5">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <Spinner className="size-4" />
              </div>
            )}

            {!loading && versions?.length === 0 && (
              <p className="px-2 py-6 text-center text-[11px] leading-relaxed text-muted-foreground">
                {unavailable
                  ? "Arsip versi belum aktif di database ini. Panel ini siap dipakai begitu migration versi diterapkan."
                  : "Belum ada versi lain untuk catatan ini."}
              </p>
            )}

            {versions?.map((version) => {
              const isCurrent =
                version.is_current || version.output_id === currentOutputId;
              const isSelected = version.output_id === selectedId;
              return (
                <button
                  key={version.output_id}
                  type="button"
                  onClick={() => setSelectedId(version.output_id)}
                  className={cn(
                    "flex w-full flex-col gap-1 rounded-lg border px-2.5 py-2 text-left transition-colors",
                    isSelected
                      ? "border-foreground/30 bg-muted"
                      : "border-transparent hover:bg-muted/60",
                  )}
                >
                  <span className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
                    <span className="truncate font-mono">{version.template_key}</span>
                    {isCurrent && (
                      <Badge variant="secondary" className="h-4 gap-0.5 px-1 text-[9px]">
                        <Check className="size-2.5" />
                        aktif
                      </Badge>
                    )}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {REASON_LABEL[version.generation_reason] ?? version.generation_reason} ·{" "}
                    {formatRelativeTime(version.created_at)}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex min-h-56 flex-col rounded-xl border border-border">
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
              <span className="text-[11px] font-medium text-muted-foreground">
                {selected
                  ? `Pratinjau · ${selected.template_key}`
                  : "Pratinjau versi"}
              </span>
              {selected && (
                <button
                  type="button"
                  onClick={() => handleRestore(selected)}
                  disabled={restoringId !== null}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                >
                  {restoringId === selected.output_id ? (
                    <Spinner className="size-3" />
                  ) : (
                    <RotateCcw className="size-3" />
                  )}
                  <span>Kembalikan versi ini</span>
                </button>
              )}
            </div>
            <div className="max-h-72 flex-1 overflow-y-auto px-4 py-3">
              {selected ? (
                <div
                  className="prose prose-neutral max-w-none text-[12px] leading-relaxed text-foreground/90 dark:prose-invert [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_li]:my-1 [&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-4"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(selected.rendered_text) }}
                />
              ) : (
                <p className="py-10 text-center text-[11px] text-muted-foreground">
                  Pilih salah satu versi di kiri untuk melihat isinya.
                </p>
              )}
            </div>
          </div>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
