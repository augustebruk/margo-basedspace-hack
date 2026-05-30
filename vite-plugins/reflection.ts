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
 * Request body:  { transcript: string }
 * Response body: { summary: string, patterns: {label, recurrenceLabel?}[], nextSteps: string[] }
 */
const REFLECTION_PATH = "/api/reflection";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1024;

const SYSTEM_PROMPT = `You are Margo, a warm, perceptive journaling companion. Given a transcript of someone's spoken journal entry, produce a short reflection.

Return STRICT JSON matching this TypeScript type, and nothing else:
{
  "summary": string,        // a warm reframe in 1-3 sentences, spoken directly to the user ("you..."). End with a gentle, open question.
  "patterns": { "label": string, "recurrenceLabel"?: string }[], // 2-4 recurring emotional themes. label is 1-3 words. recurrenceLabel is an optional tiny hint like "recurring" or "mentioned twice".
  "nextSteps": string[]     // 2-3 tiny, concrete, kind actions the user could take today.
}

Be specific to what they actually said. Never invent facts. Keep language calm and non-clinical.`;

interface ReflectionPattern {
  label: string;
  recurrenceLabel?: string;
}
interface Reflection {
  summary: string;
  patterns: ReflectionPattern[];
  nextSteps: string[];
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

  return { summary, patterns, nextSteps };
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
    try {
      const body = await readBody(req);
      transcript = (JSON.parse(body) as { transcript?: string }).transcript ?? "";
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }
    if (!transcript.trim()) {
      sendJson(res, 400, { error: "Empty transcript" });
      return;
    }

    try {
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
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: `Here is my journal entry transcript:\n\n${transcript}\n\nRespond with ONLY the JSON object, no prose or markdown fences.`,
            },
          ],
        }),
      });

      if (!response.ok) {
        const detail = await response.text();
        sendJson(res, response.status, {
          error: "Reflection generation failed",
          detail,
        });
        return;
      }

      const data = (await response.json()) as {
        content?: { type: string; text?: string }[];
      };
      const text = data.content?.find((b) => b.type === "text")?.text;
      if (!text) {
        sendJson(res, 502, { error: "Model returned no content" });
        return;
      }

      // The model returns the JSON object directly; parseModelJson tolerates
      // any stray prose or markdown fences around it.
      const reflection = normalize(parseModelJson(text));
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
