import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bookmark,
  BookmarkCheck,
  ChevronLeft,
  ChevronRight,
  FileIcon,
  FileText,
  Image,
  LayoutGrid,
  List,
  Mic,
  PlusCircle,
  Search,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyMedia,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
import { formatRelativeTime, cn } from "@/lib/utils";
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

const PAGE_SIZE = 20;

export function NotesPage() {
  const [notes, setNotes] = useState<readonly Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [savedOnly, setSavedOnly] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const navigate = useNavigate();

  // Debounce search query by 300ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      if (debouncedQuery) {
        const { data, error } = await supabase.rpc("web_search_notes", {
          p_query: debouncedQuery,
          p_limit: PAGE_SIZE,
          p_saved_only: savedOnly,
        });
        if (error) throw error;
        setNotes(data ?? []);
        setHasMore(false);
      } else {
        const { data, error } = await supabase.rpc("web_list_notes", {
          p_offset: page * PAGE_SIZE,
          p_limit: PAGE_SIZE + 1,
          p_saved_only: savedOnly,
        });
        if (error) throw error;
        const rows = data ?? [];
        setHasMore(rows.length > PAGE_SIZE);
        setNotes(rows.slice(0, PAGE_SIZE));
      }
    } catch (err) {
      console.error("Failed to load notes:", err);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, savedOnly, page]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  return (
    <>
      <Header
        title="Notes Library"
        description="All your captured notes from Telegram"
      />

      <div className="p-4 sm:p-6 md:p-8 max-w-6xl w-full mx-auto space-y-6">
        {/* Controls Bar: Search, Filters & View Switcher */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Search Input with Ctrl+F Badge */}
          <div className="relative flex-1 max-w-md hidden sm:block">
            <div className="relative flex items-center">
              <Search
                className="absolute left-3.5 size-4 text-muted-foreground pointer-events-none"
                strokeWidth={2}
                aria-hidden="true"
              />
              <input
                type="search"
                placeholder="Search notes by title, content, tags… (Ctrl+F)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-9 py-2 rounded-xl bg-muted/40 border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:border-foreground focus:ring-1 focus:ring-foreground transition-all"
                aria-label="Search notes"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="size-3.5" />
                </button>
              ) : (
                <kbd className="absolute right-3 hidden sm:inline-block px-1.5 py-0.5 rounded bg-muted border border-border text-[10px] font-mono text-muted-foreground">
                  Ctrl+F
                </kbd>
              )}
            </div>
          </div>

          {/* Action Controls: Filter & View Mode Toggle */}
          <div className="flex items-center justify-between sm:justify-end gap-2.5">
            {/* Saved Filter Toggle */}
            <Button
              variant={savedOnly ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setSavedOnly(!savedOnly);
                setPage(0);
              }}
              className="gap-1.5 text-xs font-medium"
              aria-pressed={savedOnly}
            >
              {savedOnly ? (
                <>
                  <BookmarkCheck className="size-3.5" strokeWidth={2.2} />
                  <span>Saved</span>
                </>
              ) : (
                <>
                  <Bookmark className="size-3.5" strokeWidth={2} />
                  <span>All</span>
                </>
              )}
            </Button>

            {/* Coss Segmented Control for Grid vs List */}
            <div
              className="flex items-center p-0.5 rounded-lg bg-muted border border-border"
              role="radiogroup"
              aria-label="View mode switcher"
            >
              <button
                type="button"
                role="radio"
                aria-checked={viewMode === "grid"}
                onClick={() => setViewMode("grid")}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150 cursor-pointer",
                  viewMode === "grid"
                    ? "bg-card text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
                title="Grid View"
              >
                <LayoutGrid className="size-3.5" strokeWidth={2} />
                <span className="hidden sm:inline">Grid</span>
              </button>

              <button
                type="button"
                role="radio"
                aria-checked={viewMode === "list"}
                onClick={() => setViewMode("list")}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150 cursor-pointer",
                  viewMode === "list"
                    ? "bg-card text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
                title="Table View"
              >
                <List className="size-3.5" strokeWidth={2} />
                <span className="hidden sm:inline">Table</span>
              </button>
            </div>
          </div>
        </div>

        {/* Content Section */}
        {loading ? (
          /* Coss Skeleton Loading State */
          viewMode === "grid" ? (
            <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2" role="status" aria-label="Loading notes">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="p-5 flex flex-col justify-between h-48 space-y-3">
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-3">
                      <Skeleton className="size-8 rounded-lg shrink-0" />
                      <div className="space-y-1.5 flex-1">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/3" />
                      </div>
                    </div>
                    <Skeleton className="h-3.5 w-full mt-2" />
                    <Skeleton className="h-3.5 w-5/6" />
                  </div>
                  <div className="pt-3 border-t border-border flex items-center justify-between">
                    <div className="flex gap-1.5">
                      <Skeleton className="h-4 w-12 rounded-full" />
                      <Skeleton className="h-4 w-16 rounded-full" />
                    </div>
                    <Skeleton className="h-3 w-14" />
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div role="status" aria-label="Loading notes">
              {/* Mobile Skeleton List */}
              <div className="border border-border rounded-2xl overflow-hidden bg-card divide-y divide-border sm:hidden">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="p-3.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1">
                        <Skeleton className="size-6 rounded-md shrink-0" />
                        <Skeleton className="h-4 w-3/5" />
                      </div>
                      <Skeleton className="h-3 w-12" />
                    </div>
                    <Skeleton className="h-3 w-4/5" />
                  </div>
                ))}
              </div>

              {/* Desktop Skeleton Table */}
              <div className="border border-border rounded-2xl overflow-hidden bg-card hidden sm:block">
                <Table variant="card">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Note</TableHead>
                      <TableHead className="w-28">Source</TableHead>
                      <TableHead className="w-40">Tags</TableHead>
                      <TableHead className="w-28 text-right pr-4">Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell className="py-3 px-4">
                          <div className="space-y-1.5 py-1">
                            <Skeleton className="h-4 w-52" />
                            <Skeleton className="h-3 w-36" />
                          </div>
                        </TableCell>
                        <TableCell><Skeleton className="h-4 w-14" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell className="text-right pr-4"><Skeleton className="h-4 w-14 ml-auto" /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )
        ) : notes.length === 0 ? (
          /* Coss Empty State */
          <Empty className="border border-dashed border-border rounded-2xl bg-card/40 py-16">
            <EmptyMedia variant="icon">
              <FileText className="size-5 text-muted-foreground" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>
                {searchQuery ? "No matching notes found" : "Your library is empty"}
              </EmptyTitle>
              <EmptyDescription>
                {searchQuery
                  ? `No notes match "${searchQuery}". Try searching with different keywords or reset your filters.`
                  : "Send a voice note, text, image, or document to Notinn on Telegram to automatically create your first note."}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              {searchQuery ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchQuery("");
                    setSavedOnly(false);
                  }}
                  className="text-xs"
                >
                  Reset search & filters
                </Button>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => window.open("https://t.me/NotinnBot", "_blank")}
                  className="gap-2 text-xs"
                >
                  <PlusCircle className="size-3.5" />
                  <span>Open Notinn on Telegram</span>
                </Button>
              )}
            </EmptyContent>
          </Empty>
        ) : viewMode === "grid" ? (
          /* Coss Card Grid View */
          <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2" role="feed">
            {notes.map((note) => {
              const SourceIcon = SOURCE_ICONS[note.source_type] ?? FileText;

              return (
                <Link
                  key={note.id}
                  to={`/notes/${note.id}`}
                  className="group block outline-none focus-visible:ring-1 focus-visible:ring-foreground rounded-2xl transition-transform active:scale-[0.99]"
                  aria-label={`Open note: ${note.title}`}
                >
                  <Card className="p-5 flex flex-col justify-between h-full space-y-4 hover:border-foreground/30 transition-all">
                    <CardHeader className="p-0 space-y-2.5">
                      <div className="flex items-start gap-3">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground border border-border">
                          <SourceIcon className="size-4" strokeWidth={2} />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <CardTitle className="text-sm sm:text-base font-semibold text-foreground tracking-tight group-hover:underline underline-offset-2 transition-colors line-clamp-1">
                              {note.title}
                            </CardTitle>
                            {note.is_saved && (
                              <span
                                className="inline-flex items-center gap-1 text-xs text-foreground font-medium shrink-0"
                                title="Saved Note"
                              >
                                <BookmarkCheck className="size-4" strokeWidth={2.2} />
                                <span className="sr-only">Saved note</span>
                              </span>
                            )}
                          </div>

                          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="capitalize">{note.source_type}</span>
                            <span>•</span>
                            <span className="tabular-nums font-mono">
                              {formatRelativeTime(note.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardHeader>

                    {/* Summary Snippet in CardContent */}
                    <CardContent className="p-0">
                      {note.summary ? (
                        <p className="text-xs sm:text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                          {note.summary}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground/60 italic">
                          No summary preview available.
                        </p>
                      )}
                    </CardContent>

                    {/* Footer: Tags */}
                    {note.tags && note.tags.length > 0 && (
                      <CardFooter className="p-0 pt-3 flex flex-wrap gap-1.5 border-t border-border">
                        {note.tags.slice(0, 4).map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="text-[10px] font-normal"
                          >
                            #{tag}
                          </Badge>
                        ))}
                        {note.tags.length > 4 && (
                          <span className="text-[10px] text-muted-foreground self-center">
                            +{note.tags.length - 4} more
                          </span>
                        )}
                      </CardFooter>
                    )}
                  </Card>
                </Link>
              );
            })}
          </div>
        ) : (
          /* Coss Table / Mobile List View for Notes */
          <div className="border border-border rounded-2xl overflow-hidden bg-card shadow-xs">
            {/* Mobile Adaptive Compact List */}
            <div className="divide-y divide-border sm:hidden">
              {notes.map((note) => {
                const SourceIcon = SOURCE_ICONS[note.source_type] ?? FileText;

                return (
                  <div
                    key={note.id}
                    onClick={() => navigate(`/notes/${note.id}`)}
                    className="p-3.5 space-y-1.5 active:bg-muted/60 hover:bg-muted/40 transition-colors cursor-pointer"
                    role="button"
                    tabIndex={0}
                    aria-label={`Open note: ${note.title}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-foreground border border-border">
                          <SourceIcon className="size-3" strokeWidth={2} />
                        </div>
                        <span className="font-semibold text-sm text-foreground truncate">
                          {note.title}
                        </span>
                        {note.is_saved && (
                          <BookmarkCheck className="size-3.5 text-foreground shrink-0" strokeWidth={2} />
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground shrink-0 whitespace-nowrap tabular-nums">
                        {formatRelativeTime(note.created_at)}
                      </span>
                    </div>

                    {note.summary && (
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed pl-8">
                        {note.summary}
                      </p>
                    )}

                    {note.tags && note.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 pl-8 pt-0.5">
                        {note.tags.slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-[9px] px-1.5 py-0 font-normal">
                            #{tag}
                          </Badge>
                        ))}
                        {note.tags.length > 3 && (
                          <span className="text-[9px] text-muted-foreground self-center">
                            +{note.tags.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop Structured Table */}
            <div className="hidden sm:block">
              <Table variant="card">
                <TableHeader>
                  <TableRow>
                    <TableHead className="py-3 px-4">Title & Preview</TableHead>
                    <TableHead className="w-28 py-3">Source</TableHead>
                    <TableHead className="w-40 py-3">Tags</TableHead>
                    <TableHead className="w-28 py-3 text-right pr-4">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notes.map((note) => {
                    const SourceIcon = SOURCE_ICONS[note.source_type] ?? FileText;

                    return (
                      <TableRow
                        key={note.id}
                        onClick={() => navigate(`/notes/${note.id}`)}
                        className="cursor-pointer group hover:bg-muted/40 transition-colors"
                      >
                        <TableCell className="py-3 px-4">
                          <div className="flex items-start gap-2.5">
                            <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-foreground border border-border mt-0.5">
                              <SourceIcon className="size-3.5" strokeWidth={2} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-sm text-foreground group-hover:underline underline-offset-2 truncate">
                                  {note.title}
                                </span>
                                {note.is_saved && (
                                  <BookmarkCheck className="size-3.5 text-foreground shrink-0" strokeWidth={2} />
                                )}
                              </div>
                              {note.summary && (
                                <p className="text-xs text-muted-foreground truncate max-w-md mt-0.5">
                                  {note.summary}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="py-3">
                          <span className="capitalize text-xs text-foreground font-medium">
                            {note.source_type}
                          </span>
                        </TableCell>

                        <TableCell className="py-3">
                          <div className="flex flex-wrap gap-1 max-w-[150px]">
                            {note.tags?.slice(0, 2).map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
                                #{tag}
                              </Badge>
                            ))}
                            {note.tags && note.tags.length > 2 && (
                              <span className="text-[10px] text-muted-foreground self-center">
                                +{note.tags.length - 2}
                              </span>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="py-3 text-right pr-4 tabular-nums font-mono text-xs text-muted-foreground">
                          {formatRelativeTime(note.created_at)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Pagination Controls */}
        {!searchQuery && (notes.length > 0 || page > 0) && (
          <div className="pt-6 border-t border-border flex justify-center">
            <Pagination className="mx-auto flex justify-center">
              <PaginationContent className="flex items-center gap-2">
                <PaginationItem>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 0 || loading}
                    onClick={() => setPage(Math.max(0, page - 1))}
                    className="gap-1.5 px-3 text-xs font-medium cursor-pointer"
                  >
                    <ChevronLeft className="size-3.5" />
                    <span className="hidden sm:inline">Previous</span>
                  </Button>
                </PaginationItem>

                <PaginationItem>
                  <span className="px-3.5 py-1.5 rounded-lg border border-border bg-muted/40 text-xs font-mono text-foreground font-medium select-none">
                    Page {page + 1}
                  </span>
                </PaginationItem>

                <PaginationItem>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!hasMore || loading}
                    onClick={() => setPage(page + 1)}
                    className="gap-1.5 px-3 text-xs font-medium cursor-pointer"
                  >
                    <span className="hidden sm:inline">Next</span>
                    <ChevronRight className="size-3.5" />
                  </Button>
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </div>
    </>
  );
}
