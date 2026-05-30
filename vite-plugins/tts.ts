import type { Connect, Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Dev/preview middleware that proxies ElevenLabs Text-to-Speech.
 *
 * Margo's spoken lines in the onboarding flow are synthesized here. Same
 * security posture as the Scribe token + reflection routes: the
 * `ELEVENLABS_API_KEY` lives server-side (in the Vite node process) and is
 * never exposed to the browser. In production, replace this with a real
 * serverless route at the same path (`POST /api/tts`).
 *
 * Request body:  { text: string }
 * Response body: audio/mpeg (the synthesized speech)
 *
 * If the key is missing, responds 501 so the client can gracefully fall back to
 * a silent, timed no-op (the line still shows on screen as text).
 */
const TTS_PATH = "/api/tts";

// A warm, natural default voice ("Rachel"). Override via ELEVENLABS_VOICE_ID.
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const MODEL_ID = "eleven_turbo_v2_5";

function ttsUrl(voiceId: string): string {
  return `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
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

export function ttsPlugin(
  apiKey: string | undefined,
  voiceId: string | undefined,
): Plugin {
  const voice = voiceId?.trim() || DEFAULT_VOICE_ID;

  const handler: Connect.NextHandleFunction = async (req, res, next) => {
    if (!req.url || !req.url.startsWith(TTS_PATH)) {
      next();
      return;
    }
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }
    // Signal "not configured" so the client falls back to a timed silent no-op.
    if (!apiKey) {
      sendJson(res, 501, {
        error:
          "ELEVENLABS_API_KEY is not set. Add it to a .env file (no VITE_ prefix) and restart the dev server.",
      });
      return;
    }

    let text = "";
    try {
      const body = await readBody(req);
      text = (JSON.parse(body) as { text?: string }).text ?? "";
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }
    if (!text.trim()) {
      sendJson(res, 400, { error: "Empty text" });
      return;
    }

    try {
      const response = await fetch(ttsUrl(voice), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "xi-api-key": apiKey,
          accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: MODEL_ID,
          voice_settings: { stability: 0.4, similarity_boost: 0.75 },
        }),
      });

      if (!response.ok) {
        const detail = await response.text();
        sendJson(res, response.status, {
          error: "Text-to-speech failed",
          detail,
        });
        return;
      }

      const audio = Buffer.from(await response.arrayBuffer());
      res.statusCode = 200;
      res.setHeader("content-type", "audio/mpeg");
      res.setHeader("cache-control", "no-store");
      res.end(audio);
    } catch (err) {
      sendJson(res, 502, {
        error: "Could not reach ElevenLabs",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return {
    name: "margo-tts",
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}
