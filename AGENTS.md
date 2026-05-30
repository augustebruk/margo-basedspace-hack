# AGENTS.md

## Cursor Cloud specific instructions

### Repository layout

- **`main`** currently contains only `README.md`. The runnable **Margo** React app (Vite + TypeScript) lives on **`cursor/activate-agent-mobile-6901`** (or any branch that includes `package.json` and `src/`). Check out that branch before installing dependencies or running the app.

### Services

| Service | Required? | Notes |
|--------|-----------|--------|
| **Vite dev server** | **MUST** for local dev | `npm run dev` — default http://localhost:5173. In Cloud Agent VMs, pass `--host 0.0.0.0` if the server must be reached outside the container. |
| **Vite preview** | Optional | `npm run build` then `npm run preview` for production bundle smoke tests. |
| **Backend / DB / Docker** | N/A | No app backend; AI follow-up questions are mocked in `src/Frame.tsx`. **Exceptions:** speech-to-text (ElevenLabs Scribe) and reflection generation (Anthropic Claude) are served by Vite dev/preview middleware at `/api/scribe-token` and `/api/reflection`, which need API keys set (see Env below). |

### Env

- Copy `.env.example` → `.env` and set (both server-side only; **no** `VITE_` prefix, so they never enter the client bundle; restart the dev server after editing):
  - `ELEVENLABS_API_KEY` — speech-to-text. Without it, the mic UI runs but transcription shows a "key not set" error.
  - `ANTHROPIC_API_KEY` — reflection generation. Without it, the app falls back to a built-in mock reflection (fine for demos).

### Commands (see `package.json` and `README.md`)

- **Install:** `npm install` (uses `package-lock.json`; Node 22+ verified)
- **Dev:** `npm run dev`
- **Build / typecheck:** `npm run build` (`tsc -b && vite build`)
- **Preview:** `npm run preview`
- **Lint / unit tests:** No ESLint, Prettier, or test runner scripts are configured yet.

### Running the dev server in tmux

Long-lived dev servers should use tmux (e.g. session `vite-dev-server`):

```bash
npm run dev -- --host 0.0.0.0
```

### Manual test / “hello world” flow

1. Open the app at a **mobile viewport** (~390×844).
2. Tap **Start Entry**.
3. Use the mic control (grant mic permission — ElevenLabs Scribe fills the transcript live; needs `ELEVENLABS_API_KEY` in `.env`), advance through questions, then finish the entry.
4. Confirm **loading** (“Wrapping up your entry…”) then **reflection** (summary, patterns, graph).
5. Optional: **Start daily practice** → practice placeholder → back to home.

Google Fonts load from the CDN in `index.html`; offline runs fall back to system UI fonts.
