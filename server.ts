/**
 * Production HTTP server for Margo.
 *
 * Hostinger static hosting (and any plain CDN) only serves the built `dist/`
 * folder — it cannot run the Vite dev/preview middleware that backs the
 * `/api/*` routes, so in production those routes 404 and speech-to-text,
 * Margo's TTS voice, and live reflection all break.
 *
 * This is the real backend the project's plugins always pointed at ("In
 * production, replace this with a real serverless route at the same path").
 * It reuses the EXACT same request handlers as the Vite middleware (imported
 * from `vite-plugins/*`), so dev and prod behave identically, and serves the
 * built SPA from `dist/` with a history-API fallback.
 *
 * Secrets are read from the process environment server-side only
 * (ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID, ANTHROPIC_API_KEY) — they are never
 * sent to the browser. Run after `npm run build` with `npm start`.
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { createScribeTokenHandler } from "./vite-plugins/scribeToken.ts";
import { createTtsHandler } from "./vite-plugins/tts.ts";
import { createReflectionHandler } from "./vite-plugins/reflection.ts";

// Load a local .env if present (Node 22+). On a managed host the env vars are
// injected by the platform and there is no .env file — loadEnvFile would throw,
// so we guard it. Platform-provided vars always take precedence either way.
try {
  process.loadEnvFile();
} catch {
  // No .env file (e.g. production) — rely on the process environment.
}

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const DIST_DIR = join(fileURLToPath(new URL(".", import.meta.url)), "dist");

const scribe = createScribeTokenHandler(process.env.ELEVENLABS_API_KEY);
const tts = createTtsHandler(
  process.env.ELEVENLABS_API_KEY,
  process.env.ELEVENLABS_VOICE_ID,
);
const reflection = createReflectionHandler(process.env.ANTHROPIC_API_KEY);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

/** Resolve a URL path to a file inside dist, guarding against traversal. */
function resolveStatic(urlPath: string): string | null {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  const resolved = normalize(join(DIST_DIR, clean));
  // normalize() collapses any `..`; reject anything that escaped DIST_DIR.
  if (resolved !== DIST_DIR && !resolved.startsWith(DIST_DIR + "/")) {
    return null;
  }
  return resolved;
}

async function serveFile(filePath: string): Promise<{
  body: Buffer;
  type: string;
} | null> {
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return null;
    const body = await readFile(filePath);
    const type = MIME[extname(filePath).toLowerCase()] || "application/octet-stream";
    return { body, type };
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  try {
    // API routes first — each handler returns true if it owned the request.
    if (await scribe(req, res)) return;
    if (await tts(req, res)) return;
    if (await reflection(req, res)) return;

    // Anything else under /api that no handler claimed is a real 404.
    const path = (req.url || "/").split("?")[0];
    if (path.startsWith("/api/")) {
      res.statusCode = 404;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    // Static assets from dist.
    const target = resolveStatic(req.url || "/");
    if (target) {
      const file = await serveFile(target);
      if (file) {
        res.statusCode = 200;
        res.setHeader("content-type", file.type);
        if (target.includes("/assets/")) {
          // Vite fingerprints asset filenames, so they're immutable.
          res.setHeader("cache-control", "public, max-age=31536000, immutable");
        }
        res.end(file.body);
        return;
      }
    }

    // SPA history fallback: serve index.html for unknown non-asset routes.
    const index = await serveFile(join(DIST_DIR, "index.html"));
    if (index) {
      res.statusCode = 200;
      res.setHeader("content-type", index.type);
      res.setHeader("cache-control", "no-cache");
      res.end(index.body);
      return;
    }

    res.statusCode = 404;
    res.end("Not found. Did you run `npm run build`?");
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        error: "Internal server error",
        detail: err instanceof Error ? err.message : String(err),
      }),
    );
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Margo server listening on http://${HOST}:${PORT}`);
  if (!process.env.ELEVENLABS_API_KEY) {
    console.warn("  ⚠ ELEVENLABS_API_KEY not set — STT + Margo's voice disabled.");
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("  ⚠ ANTHROPIC_API_KEY not set — reflections fall back to mocks.");
  }
});
