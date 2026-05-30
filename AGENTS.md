# AGENTS.md

## Cursor Cloud specific instructions

### Repository layout

- **`main`** currently contains only `README.md`. The runnable **Margo** React app (Vite + TypeScript) lives on **`cursor/activate-agent-mobile-6901`** (or any branch that includes `package.json` and `src/`). Check out that branch before installing dependencies or running the app.

### Services

| Service | Required? | Notes |
|--------|-----------|--------|
| **Vite dev server** | **MUST** for local dev | `npm run dev` — default http://localhost:5173. In Cloud Agent VMs, pass `--host 0.0.0.0` if the server must be reached outside the container. |
| **Vite preview** | Optional | `npm run build` then `npm run preview` for production bundle smoke tests. |
| **Backend / DB / Docker** | N/A | No app backend; AI follow-up questions are mocked in `src/Frame.tsx`. **Exceptions:** speech-to-text (ElevenLabs Scribe), text-to-speech for Margo's onboarding voice (ElevenLabs TTS), and reflection / onboarding-insight generation (Anthropic Claude) are served by Vite dev/preview middleware at `/api/scribe-token`, `/api/tts`, and `/api/reflection`, which need API keys set (see Env below). |

### Env

- Copy `.env.example` → `.env` and set (both server-side only; **no** `VITE_` prefix, so they never enter the client bundle; restart the dev server after editing):
  - `ELEVENLABS_API_KEY` — speech-to-text **and** Margo's onboarding text-to-speech. Without it, the mic UI runs but transcription shows a "key not set" error, and onboarding advances without spoken audio.
  - `ELEVENLABS_VOICE_ID` — optional; selects Margo's TTS voice. Unset → a warm default voice.
  - `ANTHROPIC_API_KEY` — reflection + onboarding-insight generation. Without it, the app falls back to a built-in mock (fine for demos).

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
2. **First run — onboarding:** tap anywhere to begin (unlocks audio autoplay), let Margo introduce herself, speak your name (tap "That's …" after the pause prompt appears), speak a first journal entry (tap "I'm done"), watch the Mirror Moment + Pattern Reveal card, then tap **Start Noticing**. (Onboarding is shown once; clear `localStorage` key `margo:onboardingComplete` to replay it.)
3. Tap **Start Entry**.
4. Use the mic control (grant mic permission — ElevenLabs Scribe fills the transcript live; needs `ELEVENLABS_API_KEY` in `.env`), advance through questions, then finish the entry.
5. Confirm **loading** (“Wrapping up your entry…”) then **reflection** (summary, patterns, graph).
6. Optional: **Start daily practice** → practice placeholder → back to home.

Google Fonts load from the CDN in `index.html`; offline runs fall back to system UI fonts.
