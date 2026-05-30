import { useCallback, useRef, useState } from "react";

/** One tiny in-the-moment skill grounded in an evidence-based modality. */
export interface PracticeSkill {
  /** Short name, 2-4 words, e.g. "Name the thought". */
  name: string;
  /** Concrete, do-it-now instruction (1-2 sentences). */
  instruction: string;
}

/**
 * A personalized, therapy-grounded daily practice generated from the entry.
 *
 * The server (`/api/reflection` in `practice` mode) silently picks the single
 * best-fitting evidence-based modality for what the person said — CBT thought
 * records, ACT defusion / values + committed action, DBT skills, Kristin Neff
 * self-compassion / CFT, or behavioral activation — and shapes these fields
 * around it. The UI never shows the modality name; it just shows the practice.
 */
export interface Practice {
  /** Warm, specific title for tonight, e.g. "Softening the Inner Critic". */
  title: string;
  /** 1-2 sentences in Margo's voice on why this practice, tonight. */
  intro: string;
  /** Friendly, non-clinical name for the technique, e.g. "Check the facts". */
  approachLabel: string;
  /** Step 1 single-choice question. */
  focusPrompt: string;
  /** Step 1 options, first-person; last is an open "something else" option. */
  options: string[];
  /** Step 2 invitation label, e.g. "Put the real thing into words". */
  deepenLabel: string;
  /** Step 2 main open writing prompt (tuned to the chosen modality). */
  deepenPrompt: string;
  /** Step 2 "write more about X" chips to expand the reflection. */
  deepenFollowups: string[];
  /** Step 3 micro-skill. */
  skill: PracticeSkill;
  /** Step 4 tiny, concrete, values-aligned committed actions. */
  actions: string[];
  /** A short, grounded closing line Margo leaves them with. */
  closingLine: string;
}

const PRACTICE_ENDPOINT = "/api/reflection";

/**
 * Fallback practice for demos when no LLM key is configured or the request
 * fails. Grounded in self-compassion (Neff) so it's gentle and broadly useful.
 */
export const MOCK_PRACTICE: Practice = {
  title: "A Kinder Word Tonight",
  intro:
    "You said a lot tonight, and I noticed how hard you are on yourself in the middle of it. Let's try being a little gentler — just for ten minutes.",
  approachLabel: "Talk to yourself like a friend",
  focusPrompt: "What feels most true tonight?",
  options: [
    "I'm carrying more than I let on",
    "I'm being really hard on myself",
    "I'm tired and stretched thin",
    "Something else is going on",
  ],
  deepenLabel: "Put the real thing into words",
  deepenPrompt:
    "Write what you'd say to a close friend who came to you with exactly what you're carrying right now.",
  deepenFollowups: [
    "What would you NOT say to them?",
    "Where do you feel this in your body?",
    "What's underneath the frustration?",
  ],
  skill: {
    name: "One hand on your chest",
    instruction:
      "Place a hand on your chest and take one slow breath. Say, quietly: this is a hard moment, and I'm allowed to be human.",
  },
  actions: [
    "Write one sentence of credit to yourself before bed.",
    "Text someone you trust one honest line about your day.",
    "Go to bed 20 minutes earlier than usual.",
  ],
  closingLine: "Tiny is enough. That's the whole point.",
};

interface UsePracticeResult {
  practice: Practice;
  generating: boolean;
  usedFallback: boolean;
  /**
   * Generate tonight's practice from the entry transcript via the
   * `/api/reflection` proxy in `practice` mode. Resolves with the practice
   * (falling back to `MOCK_PRACTICE` if the transcript is empty, the key is
   * missing, or the request fails) so the flow always has something to show.
   */
  generate: (transcript: string, name?: string) => Promise<Practice>;
}

export function usePractice(): UsePracticeResult {
  const [practice, setPractice] = useState<Practice>(MOCK_PRACTICE);
  const [generating, setGenerating] = useState(false);
  const [usedFallback, setUsedFallback] = useState(true);
  // Guards against an out-of-order response overwriting a newer one.
  const requestId = useRef(0);

  const generate = useCallback(
    async (transcript: string, name?: string): Promise<Practice> => {
      const id = ++requestId.current;
      setGenerating(true);

      const fall = (): Practice => {
        if (id === requestId.current) {
          setPractice(MOCK_PRACTICE);
          setUsedFallback(true);
        }
        return MOCK_PRACTICE;
      };

      if (!transcript.trim()) {
        const result = fall();
        setGenerating(false);
        return result;
      }

      try {
        const res = await fetch(PRACTICE_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ transcript, mode: "practice", name }),
        });

        if (!res.ok) return fall();

        const data = (await res.json()) as Practice;
        if (id !== requestId.current) return data; // superseded
        setPractice(data);
        setUsedFallback(false);
        return data;
      } catch {
        return fall();
      } finally {
        if (id === requestId.current) setGenerating(false);
      }
    },
    [],
  );

  return { practice, generating, usedFallback, generate };
}
