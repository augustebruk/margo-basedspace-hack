import { useCallback, useRef, useState } from "react";
import type { ReflectionPattern } from "./ReflectionView";

/** The data shape <ReflectionView/> consumes (sans presentational props). */
export interface Reflection {
  /** Short AI-generated title for the entry (used in the history list). */
  topic: string;
  summary: string;
  patterns: ReflectionPattern[];
  nextSteps: string[];
}

const REFLECTION_ENDPOINT = "/api/reflection";

const EMPTY_REFLECTION: Reflection = {
  topic: "",
  summary: "",
  patterns: [],
  nextSteps: [],
};

interface UseReflectionResult {
  /** The generated reflection. */
  reflection: Reflection;
  /** True while a generation request is in flight. */
  generating: boolean;
  /** Set when the most recent generation failed. */
  error: string | null;
  /**
   * Generate a reflection from the journaling transcript. Resolves with the
   * generated reflection (or `EMPTY_REFLECTION` if generation failed).
   */
  generate: (transcript: string) => Promise<Reflection>;
}

/**
 * Generates a journaling reflection from the entry transcript via the
 * server-side `/api/reflection` proxy (which holds the LLM key).
 */
export function useReflection(): UseReflectionResult {
  const [reflection, setReflection] = useState<Reflection>(EMPTY_REFLECTION);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guards against an out-of-order response overwriting a newer one.
  const requestId = useRef(0);

  const generate = useCallback(async (transcript: string) => {
    const id = ++requestId.current;
    setGenerating(true);
    setError(null);

    const fail = (message: string): Reflection => {
      if (id === requestId.current) setError(message);
      return EMPTY_REFLECTION;
    };

    if (!transcript.trim()) {
      const result = fail("No transcript to reflect on.");
      setGenerating(false);
      return result;
    }

    try {
      const res = await fetch(REFLECTION_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transcript }),
      });

      if (!res.ok) {
        return fail(`Reflection request failed (${res.status}).`);
      }

      const data = (await res.json()) as Reflection;
      if (id !== requestId.current) return data; // superseded
      setReflection(data);
      return data;
    } catch (err) {
      return fail(
        err instanceof Error ? err.message : "Reflection request failed.",
      );
    } finally {
      if (id === requestId.current) setGenerating(false);
    }
  }, []);

  return { reflection, generating, error, generate };
}
