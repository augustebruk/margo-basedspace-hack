import { useCallback, useRef } from "react";

const FOLLOWUP_ENDPOINT = "/api/reflection";

/**
 * Generic, conversation-agnostic follow-up questions used when no LLM key is
 * configured or a request fails — so the entry conversation keeps flowing.
 * Indexed by how many follow-ups have already been asked.
 */
const MOCK_FOLLOWUPS = [
  "What stood out most about that?",
  "How did that leave you feeling?",
  "Is there anything underneath that you haven't said yet?",
  "What's on your mind right now?",
  "Where do you feel that in your body?",
  "What would you tell a friend in this situation?",
  "Is there something you've been avoiding saying?",
  "What do you need most tonight?",
];

interface UseFollowupResult {
  /**
   * Ask the model for the next journaling question given the conversation so
   * far. `step` is the zero-based index of this follow-up (0 = first one after
   * the fixed opener), used to pick a sensible mock fallback. Falls back to a
   * generic question if the transcript is empty, the key is missing, or the
   * request fails — so the conversation always advances.
   */
  next: (transcript: string, step: number, name?: string) => Promise<string>;
}

export function useFollowup(): UseFollowupResult {
  // Guards against an out-of-order response being used for the wrong turn.
  const requestId = useRef(0);

  const next = useCallback(
    async (transcript: string, step: number, name?: string): Promise<string> => {
      const id = ++requestId.current;
      // Cycle through the pool (wrap, don't clamp) so repeatedly tapping "next"
      // without saying anything keeps surfacing a *different* prompt.
      const fallback =
        MOCK_FOLLOWUPS[((step % MOCK_FOLLOWUPS.length) + MOCK_FOLLOWUPS.length) %
          MOCK_FOLLOWUPS.length];

      if (!transcript.trim()) return fallback;

      try {
        const res = await fetch(FOLLOWUP_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ transcript, mode: "followup", name }),
        });
        if (!res.ok) return fallback;

        const data = (await res.json()) as { question?: string };
        // If a newer request started, discard this one (caller ignores it too).
        if (id !== requestId.current) return fallback;
        const question = (data.question ?? "").trim();
        return question || fallback;
      } catch {
        return fallback;
      }
    },
    [],
  );

  return { next };
}
