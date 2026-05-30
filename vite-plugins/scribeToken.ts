import type { Connect, Plugin } from "vite";
import type { ServerResponse } from "node:http";

/**
 * Dev/preview middleware that mints ElevenLabs Scribe single-use tokens.
 *
 * The browser must never see the raw `xi-api-key`, so this runs server-side
 * (inside the Vite node process) and exchanges the secret key for a short-lived
 * single-use token (valid ~15 min) that the client uses to open the Scribe
 * WebSocket. In production, replace this with a real serverless function /
 * backend route at the same path (`/api/scribe-token`).
 *
 * The key is read from `ELEVENLABS_API_KEY` — note the intentional absence of a
 * `VITE_` prefix, so Vite never inlines it into the client bundle.
 */
const TOKEN_PATH = "/api/scribe-token";
const ELEVENLABS_TOKEN_URL =
  "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe";

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

export function scribeTokenPlugin(apiKey: string | undefined): Plugin {
  const handler: Connect.NextHandleFunction = async (req, res, next) => {
    if (!req.url || !req.url.startsWith(TOKEN_PATH)) {
      next();
      return;
    }

    if (!apiKey) {
      sendJson(res, 500, {
        error:
          "ELEVENLABS_API_KEY is not set. Add it to a .env file (no VITE_ prefix) and restart the dev server.",
      });
      return;
    }

    try {
      const response = await fetch(ELEVENLABS_TOKEN_URL, {
        method: "POST",
        headers: { "xi-api-key": apiKey },
      });

      if (!response.ok) {
        const detail = await response.text();
        sendJson(res, response.status, {
          error: "Failed to mint ElevenLabs token",
          detail,
        });
        return;
      }

      const data = (await response.json()) as { token?: string };
      if (!data.token) {
        sendJson(res, 502, { error: "ElevenLabs response had no token" });
        return;
      }

      sendJson(res, 200, { token: data.token });
    } catch (err) {
      sendJson(res, 502, {
        error: "Could not reach ElevenLabs",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return {
    name: "margo-scribe-token",
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}
