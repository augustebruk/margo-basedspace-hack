import { useCallback, useRef, useState } from "react";
import type { ReflectionPattern } from "./ReflectionView";

/* Specific, real-life entities the LLM extracts from an entry, so the atom
 * graph maps actual people / situations / feelings the person mentioned — not
 * abstract HR-speak. These are persisted per entry and aggregated across time
 * into the cumulative knowledge graph (see graphModel.ts). */
export type GraphNodeType = "person" | "situation" | "feeling";

export interface GraphNodeSeed {
  /** The concrete thing, in the user's words: "Marcus", "the Q3 deadline". */
  label: string;
  type: GraphNodeType;
  /** A short verbatim snippet from the transcript this node came from. */
  mention: string;
}

export interface GraphLinkSeed {
  /** Matches a node label. */
  source: string;
  target: string;
  /** A short human phrase for HOW they connect, e.g. "drains me". */
  relation: string;
}

export interface EntryGraphSeed {
  nodes: GraphNodeSeed[];
  links: GraphLinkSeed[];
}

/** The data shape <ReflectionView/> consumes (sans presentational props). */
export interface Reflection {
  /** Short AI-generated title for the entry (used in the history list). */
  topic: string;
  summary: string;
  patterns: ReflectionPattern[];
  nextSteps: string[];
  /** Specific people/situations/feelings + how they relate, for the atom graph. */
  graph: EntryGraphSeed;
}

const REFLECTION_ENDPOINT = "/api/reflection";

const EMPTY_REFLECTION: Reflection = {
  topic: "",
  summary: "",
  patterns: [],
  nextSteps: [],
  graph: { nodes: [], links: [] },
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
      // Defensive: ensure the graph shape always exists even from older/mock
      // responses, so downstream consumers (the atom graph) never crash.
      const safe: Reflection = {
        ...data,
        graph:
          data.graph && Array.isArray(data.graph.nodes)
            ? {
                nodes: data.graph.nodes ?? [],
                links: Array.isArray(data.graph.links) ? data.graph.links : [],
              }
            : { nodes: [], links: [] },
      };
      if (id !== requestId.current) return safe; // superseded
      setReflection(safe);
      return safe;
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
