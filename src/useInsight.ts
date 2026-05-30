import { useCallback, useRef, useState } from "react";

/** The data shape the onboarding Mirror Moment / <InsightCard/> consumes. */
export interface Insight {
  /** Warm reflective opener Margo speaks aloud (name interpolated by the model). */
  transitionLine: string;
  /** The single recurring question underneath what the user said. */
  coreQuestion: string;
  /** Short lead-in line above the core question, e.g. "You keep coming back to:". */
  summaryLine: string;
  /** 2-3 contexts the pattern shows up in, each phrased "You …". */
  triggers: string[];
  /** A gentle, open question Margo asks. */
  margoQuestion: string;
  /** Verbatim substrings of the transcript to highlight in the replay. */
  highlightPhrases: string[];
}

const INSIGHT_ENDPOINT = "/api/reflection";

/**
 * Fallback insight for demos when no LLM key is configured or the request
 * fails. Keeps the onboarding "wow moment" unbroken end-to-end.
 */
export const MOCK_INSIGHT: Insight = {
  transitionLine: "I hear something recurring here…",
  coreQuestion: "Am I doing enough?",
  summaryLine: "You keep coming back to:",
  triggers: [
    "You compare yourself to others",
    "You wake up feeling behind",
    "You think about everything at once",
  ],
  margoQuestion: "What would 'enough' look like to you?",
  highlightPhrases: ["not doing enough", "feel behind"],
};

interface UseInsightResult {
  insight: Insight;
  generating: boolean;
  usedFallback: boolean;
  /**
   * Generate the Mirror Moment insight from the first-entry transcript via the
   * `/api/reflection` proxy in `insight` mode. Falls back to `MOCK_INSIGHT` if
   * the transcript is empty, the key is missing, or the request fails.
   */
  generate: (transcript: string, name?: string) => Promise<void>;
}

export function useInsight(): UseInsightResult {
  const [insight, setInsight] = useState<Insight>(MOCK_INSIGHT);
  const [generating, setGenerating] = useState(false);
  const [usedFallback, setUsedFallback] = useState(true);
  // Guards against an out-of-order response overwriting a newer one.
  const requestId = useRef(0);

  const generate = useCallback(async (transcript: string, name?: string) => {
    const id = ++requestId.current;
    setGenerating(true);

    const fall = () => {
      if (id !== requestId.current) return;
      setInsight(MOCK_INSIGHT);
      setUsedFallback(true);
    };

    if (!transcript.trim()) {
      fall();
      setGenerating(false);
      return;
    }

    try {
      const res = await fetch(INSIGHT_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transcript, mode: "insight", name }),
      });

      if (!res.ok) {
        fall();
        return;
      }

      const data = (await res.json()) as Insight;
      if (id !== requestId.current) return; // superseded
      setInsight(data);
      setUsedFallback(false);
    } catch {
      fall();
    } finally {
      if (id === requestId.current) setGenerating(false);
    }
  }, []);

  return { insight, generating, usedFallback, generate };
}
