/**
 * insightEngine
 *
 * Derives a simple pattern-match insight from a transcript string.
 * This is the mock implementation — replace with an AI call when ready.
 *
 * Pattern priority (first match wins):
 *   relationship  → words related to people / dynamics.
 *   performance   → work / achievement stress.
 *   overwhelm     → too much / can't cope.
 *   loss          → grief / missing something.
 *   general       → fallback.
 */

export interface Insight {
  /** Short label for the pattern detected. */
  pattern: string;
  /** The "Margo notices" sentence shown in the firstInsight panel. */
  notice: string;
}

const RULES: Array<{
  keywords: string[];
  pattern: string;
  notice: string;
}> = [
  {
    keywords: [
      "guy", "girl", "relationship", "partner", "boyfriend", "girlfriend",
      "husband", "wife", "friend", "small", "small in", "feel small",
      "ignored", "invisible", "not enough", "not good enough",
    ],
    pattern: "relationship pattern",
    notice:
      "You keep coming back to how you feel around other people. That says something important about what you need right now.",
  },
  {
    keywords: [
      "work", "job", "boss", "deadline", "project", "career", "performance",
      "fail", "failing", "fired", "promotion", "manager",
    ],
    pattern: "performance pressure",
    notice:
      "There's a lot of weight around work right now. Sometimes the pressure we feel is less about the task and more about what we think it means about us.",
  },
  {
    keywords: [
      "overwhelmed", "overwhelm", "too much", "can't cope", "can not cope",
      "stressed", "stress", "anxious", "anxiety", "panic", "exhausted",
      "burned out", "burnout",
    ],
    pattern: "overwhelm",
    notice:
      "You named a feeling without judging it. That takes more awareness than you might think.",
  },
  {
    keywords: [
      "lost", "miss", "missed", "grief", "grieving", "death", "died",
      "gone", "left", "leaving", "alone", "lonely", "loneliness",
    ],
    pattern: "loss / longing",
    notice:
      "What you're sitting with sounds heavy. Noticing the weight is the first step toward finding what you actually need.",
  },
];

/**
 * Returns an `Insight` for the given transcript.
 * Always returns a result — falls back to a general insight if no keywords match.
 */
export function deriveInsight(transcript: string): Insight {
  const lower = transcript.toLowerCase();

  for (const rule of RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      return { pattern: rule.pattern, notice: rule.notice };
    }
  }

  return {
    pattern: "general reflection",
    notice:
      "Just the act of putting words to something you've been carrying can shift how it feels. Keep going.",
  };
}
