import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileIcon,
  FileText,
  Image,
  Mic,
  BookmarkCheck,
  Search,
  Sparkles,
} from "lucide-react";
import {
  CommandDialog,
  CommandDialogPopup,
  Command,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
  CommandGroup,
  CommandGroupLabel,
  CommandPanel,
  CommandFooter,
} from "@/components/ui/command";
import { supabase } from "@/lib/supabase";
import type { Note } from "@/types/notes";

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

interface SearchCommandDialogProps {
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}

export function SearchCommandDialog({
  open: controlledOpen,
  onOpenChange: setControlledOpen,
}: SearchCommandDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const isOpen = controlledOpen ?? internalOpen;
  const setIsOpen = setControlledOpen ?? setInternalOpen;

  // Listen for Ctrl+F / Cmd+F shortcut globally
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "F" || e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setIsOpen(!isOpen);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, setIsOpen]);

  // Search when query changes
  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setResults([]);
      return;
    }

    let isMounted = true;
    const searchTimer = setTimeout(async () => {
      setLoading(true);
      try {
        if (query.trim()) {
          const { data, error } = await supabase.rpc("web_search_notes", {
            p_query: query.trim(),
            p_limit: 8,
            p_saved_only: false,
          });
          if (!error && isMounted) {
            setResults(data ?? []);
          }
        } else {
          // Show recent notes when no query is typed
          const { data, error } = await supabase.rpc("web_list_notes", {
            p_offset: 0,
            p_limit: 6,
            p_saved_only: false,
          });
          if (!error && isMounted) {
            setResults(data ?? []);
          }
        }
      } catch (err) {
        console.error("Search failed:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }, 200);

    return () => {
      isMounted = false;
      clearTimeout(searchTimer);
    };
  }, [query, isOpen]);

  const handleSelectNote = (noteId: string) => {
    setIsOpen(false);
    navigate(`/notes/${noteId}`);
  };

  return (
    <CommandDialog open={isOpen} onOpenChange={setIsOpen}>
      <CommandDialogPopup className="max-w-xl">
        <Command>
          <CommandInput
            placeholder="Search notes by title, content, or tags… (Ctrl+F)"
            value={query}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
          />
          <CommandPanel>
            <CommandList>
              {loading ? (
                <div className="flex items-center justify-center py-8 text-xs text-muted-foreground gap-2">
                  <Search className="size-4 animate-pulse" />
                  <span>Searching library…</span>
                </div>
              ) : results.length === 0 ? (
                <CommandEmpty>
                  {query ? (
                    <div className="text-center py-4">
                      <p className="text-sm font-medium text-foreground">No notes found</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Try searching with different keywords
                      </p>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm font-medium text-foreground">No recent notes</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Start typing to search your library
                      </p>
                    </div>
                  )}
                </CommandEmpty>
              ) : (
                <CommandGroup>
                  <CommandGroupLabel className="flex items-center gap-1.5 text-xs">
                    {query ? (
                      <>
                        <Search className="size-3" />
                        <span>Search Results</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-3" />
                        <span>Recent Notes</span>
                      </>
                    )}
                  </CommandGroupLabel>
                  {results.map((note) => {
                    const SourceIcon = SOURCE_ICONS[note.source_type] ?? FileText;

                    return (
                      <CommandItem
                        key={note.id}
                        value={note.id}
                        onClick={() => handleSelectNote(note.id)}
                        className="flex items-center justify-between gap-3 px-3 py-2 cursor-pointer rounded-lg hover:bg-accent transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-foreground border border-border">
                            <SourceIcon className="size-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground truncate">
                                {note.title}
                              </span>
                              {note.is_saved && (
                                <BookmarkCheck className="size-3 text-foreground shrink-0" />
                              )}
                            </div>
                            {note.summary && (
                              <p className="text-xs text-muted-foreground truncate">
                                {note.summary}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 text-[11px] text-muted-foreground font-mono">
                          <span className="capitalize">{note.source_type}</span>
                          <span>•</span>
                          <span>{note.template_key}</span>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </CommandPanel>

          <CommandFooter className="flex items-center justify-between text-xs text-muted-foreground px-4 py-2.5 border-t border-border">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-[10px] font-mono">
                  ↑↓
                </kbd>
                <span>Navigate</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-[10px] font-mono">
                  ↵
                </kbd>
                <span>Open</span>
              </span>
            </div>
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-[10px] font-mono">
                Esc
              </kbd>
              <span>Close</span>
            </div>
          </CommandFooter>
        </Command>
      </CommandDialogPopup>
    </CommandDialog>
  );
}
