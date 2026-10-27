import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface NoteCount {
  /** Global count of non-deleted notes, or null when no real number is available. */
  readonly count: number | null;
  /** False until the first count attempt has settled. */
  readonly ready: boolean;
}

/**
 * Reads the public note counter shown in the hero badge.
 *
 * The number comes from `public.get_public_note_count()`, a SECURITY DEFINER
 * aggregate: `notes` itself is unreadable for anon/authenticated, so a direct
 * `count` on the table fails. The function returns one integer and no rows.
 *
 * Kept fresh with a realtime INSERT subscription. If the RPC errors (function
 * missing, network down), `count` stays null and callers hide the badge rather
 * than render a placeholder — a fake statistic is worse than no statistic.
 */
export function useNoteCount(): NoteCount {
  const [count, setCount] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    const fetchCount = async () => {
      const { data, error } = await supabase.rpc("get_public_note_count");

      if (!active) return;
      const value = typeof data === "number" ? data : null;
      setCount(error || value === null ? null : value);
      setReady(true);
    };

    void fetchCount();

    const channel = supabase
      .channel("public-note-count")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notes" }, () => {
        void fetchCount();
      })
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  return { count, ready };
}
