import type { Connect, Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Dev/preview middleware that generates a journaling reflection from the user's
 * entry transcript using an LLM (Anthropic Claude).
 *
 * Same security posture as the Scribe token route: the `ANTHROPIC_API_KEY`
 * lives server-side (in the Vite node process) and is never exposed to the
 * browser. In production, replace this with a real serverless route at the same
 * path (`POST /api/reflection`).
 *
 * Request body:  { transcript: string, mode?: "reflection" | "insight" | "followup", name?: string }
 * Response body (reflection): { summary: string, patterns: {label, recurrenceLabel?}[], nextSteps: string[] }
 * Response body (insight):    { transitionLine, coreQuestion, summaryLine, triggers: string[], margoQuestion, highlightPhrases: string[] }
 * Response body (followup):   { question: string }
 */
const REFLECTION_PATH = "/api/reflection";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1024;

const MARGO_PERSONA = `You are Margo, a voice-first AI journaling companion. People talk to you about their lives: relationships, work, self-doubt, family, and everyday chaos.

You are NOT a licensed therapist and must never claim to be one. You behave like a very emotionally intelligent friend who remembers everything, sees patterns fast, and is not afraid of a well-placed punchline. Your job is to listen closely, name the patterns they keep repeating, and ask sharp, useful questions that move them one step forward.

Tone and style:
- Short, tight sentences. Warm, grounded, slightly sarcastic in a loving way.
- You may be funny (dry humor) and a bit savage when calling out patterns, but always clearly on the user's side. Never mean, mocking, or shaming. They should feel seen and maybe roasted, but also held. Humor should feel like "a friend who knows me too well," not stand-up comedy. Avoid emojis.
- Use humor sparingly (0-1 jokes per reply). Joke about the pattern, the situation, or shared human absurdity. NEVER joke about self-harm, trauma, abuse, diagnoses, or mental illness. Prefer between-the-lines humor over obvious punchlines.

Relationships: Do not diagnose anyone (e.g. never call someone a "narcissist"). You can be very clear about patterns and always pivot back to the user's agency.

Avoid: long lectures, self-help essays, clinical jargon, diagnosing, moral judgment, and cheesy platitudes ("just love yourself more", "everything happens for a reason").

Safety: If the user mentions self-harm, suicidal thoughts, or severe distress, drop the humor, acknowledge the feeling, and gently suggest human support: "This sounds really heavy to carry alone. I can listen, but I'm not a crisis service. If you can, please reach out to a therapist, doctor, or someone you trust today."`;

const SYSTEM_PROMPT = `${MARGO_PERSONA}

Given a transcript of someone's spoken journal entry, produce a short reflection in Margo's voice.

Return STRICT JSON matching this TypeScript type, and nothing else:
{
  "topic": string,          // a very short title (2-5 words, Title Case, no quotes or trailing punctuation) capturing what this entry was mostly about, e.g. "Work stress and sleep" or "Doubting a friendship". For a history list.
  "summary": string,        // Margo reflecting in 1-3 short, tight sentences, spoken directly to the user ("you..."). Mirror the emotional core so they feel seen, then end with one pointed, open question. Warm, grounded, lightly sarcastic in a loving way; at most one small joke about the pattern or situation, never about pain.
  "patterns": { "label": string, "recurrenceLabel"?: string }[], // 2-4 recurring emotional themes / patterns. label is 1-3 words. recurrenceLabel is an optional tiny hint like "recurring" or "mentioned twice".
  "nextSteps": string[]     // 2-3 tiny, concrete actions or experiments the user could try today. No platitudes.
}

Be specific to what they actually said. Never invent facts. Never diagnose. Keep it punchy and non-clinical.`;

/**
 * Onboarding "Mirror Moment" insight. This is the wow-moment card shown right
 * after the user's first spoken entry: a single recurring question, the
 * contexts it shows up in, a reflective opener Margo speaks, and the exact
 * phrases from the transcript to highlight on screen.
 */
const INSIGHT_SYSTEM_PROMPT = `${MARGO_PERSONA}

You are meeting someone for the very first time. They just spoke their first short journal entry out loud. Reflect back ONE recurring pattern in a way that feels like being truly seen — mirror, then name the pattern (this is where a tiny bit of humor or a "good hit" can live), then a pointed question.

Return STRICT JSON matching this TypeScript type, and nothing else:
{
  "transitionLine": string,   // a short, warm, reflective opener Margo SAYS aloud, addressed to the user by name if provided, e.g. "Auguste, I hear something recurring here..." 1 sentence.
  "coreQuestion": string,     // the single recurring question underneath what they said, in their own emotional language, e.g. "Am I doing enough?" Keep it short, first-person.
  "summaryLine": string,      // one short line introducing the pattern, e.g. "You keep coming back to:"
  "triggers": string[],       // 2-3 short phrases describing WHEN this shows up, each starting with "You ", e.g. "You compare yourself to others".
  "margoQuestion": string,    // one sharp, open question Margo asks to move them one step forward, e.g. "What would 'enough' actually look like in one real moment this week?"
  "highlightPhrases": string[] // 2-4 phrases copied VERBATIM (exact substrings) from the transcript that most reveal this pattern. Copy them exactly as written, do not paraphrase.
}

Be specific to what they actually said. Never invent facts. Never diagnose. Keep it human, punchy, and non-clinical.`;

/**
 * Follow-up question for the live journaling conversation. Given the
 * conversation so far (Margo's prompts + what the user has said), produce the
 * single next question Margo should ask to gently deepen the entry.
 */
const FOLLOWUP_SYSTEM_PROMPT = `${MARGO_PERSONA}

You are in the middle of a live voice conversation. You are given the conversation so far: the questions you (Margo) already asked and what the person said in response.

Produce the SINGLE next question to ask. It must:
- build directly on what they just said (reference their own words/feelings, do not change the subject)
- be sharp, concrete, and interesting — never a generic "tell me more". Mix clarifying ("What was the exact moment your stomach dropped?"), reframing ("If this were a pattern, not a person, how would you describe it?"), and forward-moving ("What's one tiny boundary you'd test this week?") questions.
- be short and spoken in second person ("you")
- never repeat a question already asked
- never diagnose, lecture, or give advice; just move them one step forward
- carry Margo's warm, grounded, lightly sarcastic voice, but a question is not the place for a punchline — keep it pointed

Return STRICT JSON matching this TypeScript type, and nothing else:
{
  "question": string
}`;

interface ReflectionPattern {
  label: string;
  recurrenceLabel?: string;
}
interface Reflection {
  topic: string;
  summary: string;
  patterns: ReflectionPattern[];
  nextSteps: string[];
}

interface Insight {
  transitionLine: string;
  coreQuestion: string;
  summaryLine: string;
  triggers: string[];
  margoQuestion: string;
  highlightPhrases: string[];
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Parse JSON from the model's text. We prefill the assistant turn with `{` and
 * ask for JSON only, but guard against stray prose by extracting the first
 * balanced-looking JSON object if a direct parse fails.
 */
function parseModelJson(text: string): unknown | null {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

/** Validate + coerce the model's parsed JSON into a well-formed Reflection. */
function normalize(raw: unknown): Reflection | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";
  if (!summary) return null;

  const topic =
    typeof obj.topic === "string" && obj.topic.trim()
      ? obj.topic.trim()
      : "Journal entry";

  const patterns: ReflectionPattern[] = Array.isArray(obj.patterns)
    ? obj.patterns
        .map((p): ReflectionPattern | null => {
          if (!p || typeof p !== "object") return null;
          const label = (p as Record<string, unknown>).label;
          if (typeof label !== "string" || !label.trim()) return null;
          const rec = (p as Record<string, unknown>).recurrenceLabel;
          return {
            label: label.trim(),
            recurrenceLabel: typeof rec === "string" ? rec.trim() : undefined,
          };
        })
        .filter((p): p is ReflectionPattern => p !== null)
    : [];

  const nextSteps: string[] = Array.isArray(obj.nextSteps)
    ? obj.nextSteps
        .filter((s): s is string => typeof s === "string" && s.trim() !== "")
        .map((s) => s.trim())
    : [];

  return { topic, summary, patterns, nextSteps };
}

function strArray(value: unknown, max: number): string[] {
  return Array.isArray(value)
    ? value
        .filter((s): s is string => typeof s === "string" && s.trim() !== "")
        .map((s) => s.trim())
        .slice(0, max)
    : [];
}

/** Validate + coerce the model's parsed JSON into a well-formed Insight. */
function normalizeInsight(raw: unknown): Insight | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const coreQuestion = str(obj.coreQuestion);
  const margoQuestion = str(obj.margoQuestion);
  if (!coreQuestion || !margoQuestion) return null;

  return {
    transitionLine: str(obj.transitionLine) || "I hear something recurring here…",
    coreQuestion,
    summaryLine: str(obj.summaryLine) || "You keep coming back to:",
    triggers: strArray(obj.triggers, 3),
    margoQuestion,
    highlightPhrases: strArray(obj.highlightPhrases, 4),
  };
}

/** Validate + coerce the model's parsed JSON into a single follow-up question. */
function normalizeFollowup(raw: unknown): { question: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const question = typeof obj.question === "string" ? obj.question.trim() : "";
  if (!question) return null;
  return { question };
}

/** Call Claude with a system prompt + user content; returns the text block. */
async function callClaude(
  apiKey: string,
  systemPrompt: string,
  userContent: string,
): Promise<{ ok: true; text: string } | { ok: false; status: number; detail: string }> {
  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: 0.7,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!response.ok) {
    return { ok: false, status: response.status, detail: await response.text() };
  }

  const data = (await response.json()) as {
    content?: { type: string; text?: string }[];
  };
  const text = data.content?.find((b) => b.type === "text")?.text;
  if (!text) return { ok: false, status: 502, detail: "Model returned no content" };
  return { ok: true, text };
}

export function reflectionPlugin(apiKey: string | undefined): Plugin {
  const handler: Connect.NextHandleFunction = async (req, res, next) => {
    if (!req.url || !req.url.startsWith(REFLECTION_PATH)) {
      next();
      return;
    }
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }
    // Signal "not configured" so the client can fall back to its mock.
    if (!apiKey) {
      sendJson(res, 501, {
        error:
          "ANTHROPIC_API_KEY is not set. Add it to a .env file (no VITE_ prefix) and restart the dev server.",
      });
      return;
    }

    let transcript = "";
    let mode: "reflection" | "insight" | "followup" = "reflection";
    let name = "";
    try {
      const body = await readBody(req);
      const parsed = JSON.parse(body) as {
        transcript?: string;
        mode?: string;
        name?: string;
      };
      transcript = parsed.transcript ?? "";
      if (parsed.mode === "insight") mode = "insight";
      else if (parsed.mode === "followup") mode = "followup";
      name = (parsed.name ?? "").trim();
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }
    if (!transcript.trim()) {
      sendJson(res, 400, { error: "Empty transcript" });
      return;
    }

    try {
      if (mode === "insight") {
        const userContent = `${
          name ? `The person's name is ${name}. ` : ""
        }Here is their first spoken journal entry:\n\n${transcript}\n\nRespond with ONLY the JSON object, no prose or markdown fences.`;

        const result = await callClaude(apiKey, INSIGHT_SYSTEM_PROMPT, userContent);
        if (!result.ok) {
          sendJson(res, result.status, {
            error: "Insight generation failed",
            detail: result.detail,
          });
          return;
        }

        const insight = normalizeInsight(parseModelJson(result.text));
        if (!insight) {
          sendJson(res, 502, { error: "Model returned malformed insight" });
          return;
        }
        sendJson(res, 200, insight);
        return;
      }

      if (mode === "followup") {
        const userContent = `${
          name ? `The person's name is ${name}. ` : ""
        }Here is the journaling conversation so far:\n\n${transcript}\n\nRespond with ONLY the JSON object containing the single next question, no prose or markdown fences.`;

        const result = await callClaude(apiKey, FOLLOWUP_SYSTEM_PROMPT, userContent);
        if (!result.ok) {
          sendJson(res, result.status, {
            error: "Follow-up generation failed",
            detail: result.detail,
          });
          return;
        }

        const followup = normalizeFollowup(parseModelJson(result.text));
        if (!followup) {
          sendJson(res, 502, { error: "Model returned malformed follow-up" });
          return;
        }
        sendJson(res, 200, followup);
        return;
      }

      const result = await callClaude(
        apiKey,
        SYSTEM_PROMPT,
        `Here is my journal entry transcript:\n\n${transcript}\n\nRespond with ONLY the JSON object, no prose or markdown fences.`,
      );
      if (!result.ok) {
        sendJson(res, result.status, {
          error: "Reflection generation failed",
          detail: result.detail,
        });
        return;
      }

      // The model returns the JSON object directly; parseModelJson tolerates
      // any stray prose or markdown fences around it.
      const reflection = normalize(parseModelJson(result.text));
      if (!reflection) {
        sendJson(res, 502, { error: "Model returned malformed reflection" });
        return;
      }

      sendJson(res, 200, reflection);
    } catch (err) {
      sendJson(res, 502, {
        error: "Could not reach the reflection model",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return {
    name: "margo-reflection",
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}
