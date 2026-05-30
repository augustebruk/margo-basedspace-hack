import { useCallback, useRef, useState } from "react";
import type { ReflectionPattern } from "./ReflectionView";

/** The data shape <ReflectionView/> consumes (sans presentational props). */
export interface Reflection {
  summary: string;
  patterns: ReflectionPattern[];
  nextSteps: string[];
}

const REFLECTION_ENDPOINT = "/api/reflection";

/**
 * Fallback reflection, used for demos when no LLM key is configured or the
 * request fails. Keeps the flow unbroken end-to-end.
 */
export const MOCK_REFLECTION: Reflection = {
  summary:
    "Across your last few entries, you often mention feeling drained after saying yes to extra work. It seems like your need for rest keeps colliding with a fear of letting people down. What would it look like to protect a little more rest this week without disappointing yourself?",
  patterns: [
    { label: "Overwhelm", recurrenceLabel: "3x this week" },
    { label: "Need for rest", recurrenceLabel: "recurring" },
    { label: "Boundary setting", recurrenceLabel: "2 entries" },
    { label: "Self-criticism" },
  ],
  nextSteps: [
    "Block 20 minutes of unscheduled rest today.",
    "Say no to one non-essential request.",
    "Note one thing you handled well.",
  ],
};

interface UseReflectionResult {
  /** The generated reflection (or the mock fallback). */
  reflection: Reflection;
  /** True while a generation request is in flight. */
  generating: boolean;
  /** True when the current reflection came from the mock fallback. */
  usedFallback: boolean;
  /**
   * Generate a reflection from the journaling transcript. Resolves once the
   * reflection state has been set (either from the model or the fallback).
   */
  generate: (transcript: string) => Promise<void>;
}

/**
 * Generates a journaling reflection from the entry transcript via the
 * server-side `/api/reflection` proxy (which holds the LLM key). Falls back to
 * `MOCK_REFLECTION` if the transcript is empty, the key is missing, or the
 * request fails — so the reflection screen always has content to show.
 */
export function useReflection(): UseReflectionResult {
  const [reflection, setReflection] = useState<Reflection>(MOCK_REFLECTION);
  const [generating, setGenerating] = useState(false);
  const [usedFallback, setUsedFallback] = useState(true);
  // Guards against an out-of-order response overwriting a newer one.
  const requestId = useRef(0);

  const generate = useCallback(async (transcript: string) => {
    const id = ++requestId.current;
    setGenerating(true);

    const fall = () => {
      if (id !== requestId.current) return;
      setReflection(MOCK_REFLECTION);
      setUsedFallback(true);
    };

    if (!transcript.trim()) {
      fall();
      setGenerating(false);
      return;
    }

    try {
      const res = await fetch(REFLECTION_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transcript }),
      });

      if (!res.ok) {
        fall();
        return;
      }

      const data = (await res.json()) as Reflection;
      if (id !== requestId.current) return; // superseded
      setReflection(data);
      setUsedFallback(false);
    } catch {
      fall();
    } finally {
      if (id === requestId.current) setGenerating(false);
    }
  }, []);

  return { reflection, generating, usedFallback, generate };
}
