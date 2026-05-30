import { useCallback, useState } from "react";
import type { Reflection } from "./useReflection";

/* ============================================================================
 * Past-entries store — persists completed journaling sessions so the History
 * tab can list them and replay their reflection.
 *
 * We deliberately store ONLY text: the transcribed conversation, a few light
 * stats (duration, word count), the AI topic, and the generated reflection.
 * No audio is ever captured or saved.
 *
 * Backed by localStorage (frontend-only prototype). Swap for a real backend
 * later — the `Entry` shape is what a server route should return.
 * ==========================================================================*/
export interface Entry {
  /** Stable unique id. */
  id: string;
  /** When the session finished (epoch ms) — used for sorting + display. */
  createdAt: number;
  /** Short AI-generated title shown in the history list. */
  topic: string;
  /** How long the session ran, in milliseconds. */
  durationMs: number;
  /** Number of words the user spoke across the session. */
  wordCount: number;
  /** The transcribed conversation (Margo's prompts + the user's answers). */
  transcript: string;
  /** The reflection generated for this entry (summary / patterns / steps). */
  reflection: Reflection;
}

const ENTRIES_KEY = "margo:entries";

function readEntries(): Entry[] {
  try {
    const raw = localStorage.getItem(ENTRIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Defensive: keep only well-shaped records.
    return parsed.filter(
      (e): e is Entry =>
        e &&
        typeof e === "object" &&
        typeof e.id === "string" &&
        typeof e.createdAt === "number" &&
        typeof e.reflection === "object",
    );
  } catch {
    return [];
  }
}

function writeEntries(entries: Entry[]): void {
  try {
    localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
  } catch {
    // ignore (private mode / storage disabled / quota)
  }
}

/** Count words in a transcript, ignoring the "Q:"/"A:" turn markers. */
export function countWords(transcript: string): number {
  const spoken = transcript
    .split("\n")
    .filter((line) => !/^\s*Q:/.test(line))
    .join(" ")
    .replace(/^\s*A:\s*/gm, " ");
  const matches = spoken.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

interface UseEntriesResult {
  /** All saved entries, most recent first. */
  entries: Entry[];
  /** Persist a new entry and return it (id + createdAt filled in). */
  addEntry: (entry: Omit<Entry, "id" | "createdAt">) => Entry;
  /** Remove every saved entry. */
  clear: () => void;
}

export function useEntries(): UseEntriesResult {
  const [entries, setEntries] = useState<Entry[]>(readEntries);

  const addEntry = useCallback(
    (entry: Omit<Entry, "id" | "createdAt">): Entry => {
      const full: Entry = {
        ...entry,
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `entry-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        createdAt: Date.now(),
      };
      setEntries((prev) => {
        const next = [full, ...prev];
        writeEntries(next);
        return next;
      });
      return full;
    },
    [],
  );

  const clear = useCallback(() => {
    setEntries([]);
    writeEntries([]);
  }, []);

  return { entries, addEntry, clear };
}
