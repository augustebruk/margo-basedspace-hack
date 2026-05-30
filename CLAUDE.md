# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Margo** — a frontend-only React + Vite + TypeScript prototype of a voice-journaling mobile app, styled with Tailwind CSS v4 and animated with `motion` (Framer Motion). It implements a Figma mockup; there is **no separate app backend** — but the AI features are real and served by small request handlers that hold the keys server-side: **speech-to-text** (ElevenLabs Scribe v2 Realtime), **text-to-speech** for Margo's voice in onboarding (ElevenLabs TTS), and a single `/api/reflection` LLM proxy (Anthropic Claude) that — switched by a `mode` field — generates the entry **reflection** (summary / patterns / next steps / topic / atom-graph seed), the live **follow-up questions**, tonight's personalized **practice**, the cross-entry **insights** period reflection, and the onboarding **insight** ("Pattern Reveal"). In **dev** these run as Vite dev/preview middleware (`vite-plugins/*`); in **production** the exact same handlers run inside a tiny Node server (`server.ts`) — see "Production server" below. The app is designed for a mobile viewport (390×844) and renders a phone-shaped frame centered on any screen. Past entries are persisted locally (`localStorage`) so the History and Insights screens have something to look back across.

## Commands

```bash
npm install          # Node 22+
npm run dev          # Vite dev server, http://localhost:5173
npm run dev -- --host 0.0.0.0   # expose outside a container (Cloud Agent VMs)
npm run build        # tsc -b && vite build && npm run build:server (typecheck + build gate; emits dist/ + server.js)
npm run preview      # serve the production bundle (Vite preview)
npm start            # production: node server.js (serves dist/ + /api/*; run npm run build first)
```

There is **no lint, formatter, or test runner configured**. `npm run build` is the only verification gate — TypeScript runs in `strict` mode with `noUnusedLocals`/`noUnusedParameters`, so unused symbols fail the build. `build` has three stages: `tsc -b` (typecheck), `vite build` (the SPA → `dist/`), and `build:server` (esbuild bundles `server.ts` → `server.js`).

## Production server

In dev/preview the `/api/*` routes are Vite middleware (`vite-plugins/*`). A purely static deploy of `dist/` 404s on every `/api/*` call (broken STT/TTS/reflection), so production needs a running Node process.

- **`server.ts`** — a tiny `node:http` server that serves the built SPA from `dist/` (with history-API fallback + long-cache headers on `/assets/*`) and handles `/api/scribe-token`, `/api/tts`, `/api/reflection` using the **same** handler factories imported from `vite-plugins/*` (`createScribeTokenHandler`, `createTtsHandler`, `createReflectionHandler`), so dev and prod behave identically. It auto-loads a local `.env` via `process.loadEnvFile()` (guarded — managed hosts inject env vars instead), and listens on `PORT` (default 3000) / `HOST` (default `0.0.0.0`). Secrets stay server-side only.
- **Build/run:** `npm run build:server` bundles `server.ts` → `server.js` with esbuild (`--platform=node --format=esm --packages=external`); `npm start` runs `node server.js`. `npm run build` runs `build:server` as its last stage. Deploy as a **Node app** (e.g. Hostinger Node.js hosting), not a static site — see README's "Deploying to production".

## Speech-to-text (ElevenLabs Scribe)

Live transcription is wired to **ElevenLabs Scribe v2 Realtime** (`@elevenlabs/client`).

- **`src/useScribe.ts`** — React hook owning one Scribe WebSocket per recording session. It fetches a single-use token, opens `Scribe.connect({ modelId: "scribe_v2_realtime", commitStrategy: VAD, microphone: {...} })`, and forwards `partial_transcript` / `committed_transcript` events to `setPersonTranscript`. It exposes `requestPermission()` and, inside `start()`, **eagerly primes the mic permission** (`navigator.mediaDevices.getUserMedia`) synchronously within the user gesture *before* the token fetch — Safari/iOS/Private mode only show the permission prompt when `getUserMedia` is reached directly from the gesture's call stack, and the Scribe client's own `getUserMedia` runs too late (after the `await fetchToken()`). The primer stream is stopped immediately; `getUserMedia` rejections are turned into actionable, Safari-aware error messages.
- **`vite-plugins/scribeToken.ts`** — dev/preview middleware serving `POST /api/scribe-token`. It exchanges the server-side `ELEVENLABS_API_KEY` for a short-lived (~15 min) single-use token via `https://api.elevenlabs.io/v1/single-use-token/realtime_scribe`. The raw key never reaches the browser. In production the **same** handler runs inside `server.ts` (see "Production server").
- **Env:** copy `.env.example` → `.env` and set `ELEVENLABS_API_KEY`. The var is intentionally **not** `VITE_`-prefixed so Vite never inlines it into the client bundle. Restart the dev server after editing `.env`. Without a key, the mic UI works but shows a "key not set" error in the transcript area.

## The `/api/reflection` LLM proxy (modes)

A single dev/preview middleware — **`vite-plugins/reflection.ts`** — serves `POST /api/reflection`. It holds the server-side `ANTHROPIC_API_KEY`, shares one Margo persona prompt, and branches on a `mode` field in the request body to pick the right system prompt + response shape. It tolerantly extracts/validates JSON from the model before returning it. In production the **same** handler runs inside `server.ts` (see "Production server"); swap provider/model in the handler factory as needed. All client hooks fall back to a built-in mock when the key is missing, the request fails, or the input is empty, so every screen always reads as finished.

| Mode (request `mode`) | Client hook | Returns | Used for |
|------------------------|-------------|---------|----------|
| _(default, none)_ | `useReflection` | `{ topic, summary, patterns[], nextSteps[], graph }` | The end-of-entry reflection. |
| `"insight"` | `useInsight` | `{ transitionLine, coreQuestion, summaryLine, triggers[], margoQuestion, highlightPhrases[] }` | Onboarding "Pattern Reveal" card. |
| `"followup"` | `useFollowup` | `{ question }` | The next live journaling question. |
| `"practice"` | `usePractice` | a `Practice` (title, intro, 4 steps, closing line) | Tonight's personalized practice. |
| `"insights"` | `useInsights` | `{ headline, throughLine, shift, question }` | Cross-entry "Insights" period reflection. |

### Entry reflection (default mode)

- **`src/useReflection.ts`** — hook exposing `generate(transcript)` + `reflection`. POSTs the transcript to `/api/reflection` (no `mode`) and uses the real model response (defensively normalizing the `graph` shape). On an empty transcript, a non-OK response, or a failure it records an `error` and returns `EMPTY_REFLECTION` (no mock fallback for this mode). Exports the `Reflection` type plus the atom-graph seed types (`GraphNodeType`, `GraphNodeSeed`, `GraphLinkSeed`, `EntryGraphSeed`).
- The reflection includes a `topic` (short title for the History list) and a `graph` seed: the specific **people / situations / feelings** the person mentioned (each with a verbatim `mention`) and how they connect. These seeds are persisted per entry and aggregated across time into the cumulative "atom graph" (see `graphModel.ts`).
- **Transcript:** `Frame.tsx` accumulates each spoken (or typed) turn (`recordTurn`) into `transcriptLog`; `handleFinishEntry` joins it and runs reflection generation in parallel with the minimum loading delay, advancing to `reflection` only once both settle. It also persists the finished session via `useEntries.addEntry` and kicks off practice generation in parallel.

### Follow-up questions (`mode: "followup"`)

- **`src/useFollowup.ts`** — `next(transcript, step, name)` asks the model for the next journaling question given the conversation so far. The opener is a fixed `OPENING_QUESTION` ("How was your day?") in `Frame.tsx`; every subsequent prompt is generated. The conversation is **endless** — it only ends when the user taps finish. Falls back to a cycling `MOCK_FOLLOWUPS` pool, guarded by a request id against out-of-order responses.

### Practice (`mode: "practice"`)

- **`src/usePractice.ts`** — `generate(transcript, name)` produces a `Practice`: the server silently picks the single best-fitting evidence-based modality for what the person said (CBT thought records, ACT defusion / values + committed action, DBT skills, Neff self-compassion / CFT, behavioral activation) and shapes a 4-step flow (Focus → Deepen → Skill → Commit) around it — the UI never names the modality. Falls back to `MOCK_PRACTICE`. Generated in parallel during the loading screen so it's ready by the time the user taps "Start daily practice".

### Insights (`mode: "insights"`)

- **`src/useInsights.ts`** — `generate(digest, name)` produces the cross-entry period reflection shown atop the Insights screen, looking ACROSS many entries in the selected range to name the through-line and what's shifting. Falls back to `MOCK_INSIGHTS`, request-id guarded against fast range switches.

### Onboarding insight (`mode: "insight"`)

- **`src/useInsight.ts`** — wraps the `insight` mode (the first-entry "Pattern Reveal") with a `MOCK_INSIGHT` fallback. Driven by `Onboarding.tsx`.

## Text-to-speech (Margo's voice, onboarding)

Margo speaks her onboarding lines with **real ElevenLabs TTS**.

- **`src/useMargoVoice.ts`** — hook exposing `speak(text)`, `prefetch(text)` (warm upcoming audio to hide latency), `unlock()` (play a silent clip on first user gesture to satisfy browser autoplay policy), `stop()`, and `speaking`. Caches fetched audio by text; if TTS fails it degrades gracefully (resolves after an estimated duration so the flow keeps advancing without sound).
- **`vite-plugins/tts.ts`** — dev/preview middleware serving `POST /api/tts`. Holds the server-side `ELEVENLABS_API_KEY`, calls ElevenLabs TTS, and streams `audio/mpeg` back. In production the **same** handler runs inside `server.ts` (see "Production server").
- **Env:** `ELEVENLABS_API_KEY` (shared with STT) and optional `ELEVENLABS_VOICE_ID`. Server-side only, no `VITE_` prefix.

## Client-side env flags

Two **client-side** flags (kept with the `VITE_` prefix so they're readable in the browser bundle), useful for prod demos:

- `VITE_SKIP_ONBOARDING=1` — skip the first-run onboarding and go straight to the journaling app.
- `VITE_OVERRIDE_NAME` — when set, always used as the person's name, taking precedence over any name captured during onboarding.

## Architecture

The entire app is a single client-side state machine living in `src/Frame.tsx`. There is no router. `Frame` drives a `phase` state through the screens below, transitioned with `<AnimatePresence mode="wait">`:

```
onboarding → entry → loading → reflection → practice → (back home resets to entry)
                                     ↘ history → historyDetail
                                     ↘ insights
```

New users start in `onboarding`; returning users (who have `margo:onboardingComplete` set in `localStorage`) skip straight to `entry`. `VITE_SKIP_ONBOARDING=1` forces straight into `entry`. `VITE_OVERRIDE_NAME`, when set, overrides the captured name everywhere.

- **`onboarding`** — `Onboarding.tsx`, the voice-first "Your First Mirror Moment" flow. One continuous conversation with five sub-steps (`entrance → name → firstYap → mirror → invitation`). Margo speaks with real ElevenLabs TTS (`useMargoVoice`), the user speaks their name and first entry (real ElevenLabs Scribe STT via `useScribe`), and Claude generates a "Pattern Reveal" insight (`useInsight` → `/api/reflection` in `insight` mode). Advancement is **tap-to-continue**: the mic auto-starts after Margo finishes speaking, and a tap prompt appears only after a first natural pause is detected. Captured name + completion flag persist via `useOnboarding` (`localStorage`). Finishing ("Start Noticing" or "Save & Exit") sets `onboardingComplete` and enters `entry`.
- **`entry`** — the voice-journaling conversation. Its own sub-state-machine via `bulbState: "idle" | "aiSpeaking" | "personSpeaking"`. `aiSay()` shows a question and sets `aiSpeaking`; `listen()` sets `personSpeaking`. The opener is the fixed `OPENING_QUESTION`; tapping "next" generates an endless stream of AI follow-ups via `useFollowup`. The user can answer by **mic** (live Scribe STT into `setPersonTranscript`) or by toggling the **keyboard** (a textarea); switching between them preserves the in-progress turn. The entry only wraps up when the user taps the finish (check mark) button. From the idle home screen, bottom-corner icons open History (right) and Insights (left).
- **`loading`** — white "preparing" screen shown while the reflection (and practice) generate. It waits for **both** a minimum delay (`LOADING_MS`, 1900ms) **and** the generation promise before flipping to `reflection`. On finish, the session is persisted via `useEntries.addEntry`.
- **`reflection`** — `ReflectionView`, fed the generated reflection (summary + patterns + nextSteps + the atom-graph seed). `EntryGraph` renders an Obsidian-style node graph here. CTA → `practice`.
- **`practice`** — `PracticeView`, the personalized 4-step daily practice (Focus → Deepen → Skill → Commit) generated by `usePractice`; "back home" resets all entry state to `entry`.
- **`history`** — `HistoryView`, the scrollable list of saved past entries (most recent first), each a card with date/time + AI `topic`. Tapping one →
- **`historyDetail`** — `EntryDetailView`, a single past entry: session stats (duration + word count), the transcribed conversation (audio is never stored — only text), and its reflection (patterns, the cumulative atom graph as of that entry, next steps).
- **`insights`** — `InsightsView`, the cross-entry "trends" screen: a Today/Week/Month/All-time `RangeToggle`, the AI period reflection (`useInsights`), locally-computed stats, the period's recurring `PatternTags`, and the aggregated atom graph for the range.

### Persistence + the atom graph

- **`src/useEntries.ts`** — the past-entries store (`localStorage` key `margo:entries`). Persists ONLY text per session: the transcript, light stats (duration, word count), the AI `topic`, and the generated reflection. Exports the `Entry` type and `countWords`.
- **`src/graphModel.ts`** — pure helpers that aggregate many entries' per-entry graph seeds into ONE cumulative "atom graph" of a person's life (the people/situations/feelings they keep mentioning, with frequency counts, entry-share, and what's new/grown). `GraphRange` = `today | week | month | all`.
- **`src/insightsModel.ts`** — pure, no-API helpers deriving cross-entry stats (entries-in-range, top entities, etc.) for the Insights screen; the AI narrative is layered on top by `useInsights`.

### Where to plug in a real backend

`Frame.tsx` is the integration seam, and `/api/reflection` + `/api/scribe-token` + `/api/tts` are the proxy seams. Speech-to-text (`useScribe`), TTS (`useMargoVoice`), and all LLM generation (reflection, follow-ups, practice, insights, onboarding insight) are **already wired**. The three `/api/*` routes are implemented once as handler factories in `vite-plugins/*` and shared between the Vite dev/preview middleware and the production `server.ts` — to use a different provider/model, edit those factories (and the prod server picks it up automatically). Persistence is `localStorage`-only (`useEntries`); the `Entry` shape is what a real backend route should return.

### Components & modules (`src/`)

- **Entry UI:** `BulbAvatar` (the animated "AI" orb, driven by `BulbState`), `Controls` (mic / keyboard / next / finish buttons with inline SVG icons), `MargoLogo`.
- **Reflection & graph:** `ReflectionView`, `EntryGraph` (the node graph), `PatternTags` (frequency-aware pattern chips), `RangeToggle`.
- **History & insights:** `HistoryView`, `EntryDetailView`, `InsightsView`, `BottomNav` (the Home pill / tab bar), `entryFormat.ts` (date/time/duration helpers), `insightsModel.ts`, `graphModel.ts`.
- **Practice:** `PracticeView`.
- **Onboarding:** `Onboarding` (+ its `EntranceStep` / `NameStep` / `FirstYapStep` / `MirrorStep` / `InvitationStep` sub-steps) and `InsightCard` (the "Pattern Reveal" card).
- **Hooks/utils:** `useScribe`, `useMargoVoice`, `useReflection`, `useFollowup`, `usePractice`, `useInsights`, `useInsight`, `useEntries`, `useOnboarding`, and `highlight.ts` (tolerant phrase matching for the Mirror Moment highlights).

Components export their prop/state types (e.g. `BulbState`, `ReflectionViewProps`, `Entry`) for consumers.

## Conventions

- **Styling is inline Tailwind utility classes**, including arbitrary values straight from the Figma design — exact hex colors (`text-[#1c2b33]`), pixel sizes (`pt-[118px]`), gradients, and `[font-family:'Inter',Helvetica]`. Match this verbatim-from-design style when editing; don't refactor magic numbers into tokens unless asked.
- **Animation is `motion/react`** throughout — `motion.*` elements, `Variants` keyed by state name, and `AnimatePresence` for mount/unmount transitions. New screen transitions should follow the existing `AnimatePresence mode="wait"` + `key` pattern in `Frame`.
- Inter is loaded from the Google Fonts CDN in `index.html`; offline runs fall back to system fonts.
- Icons are hand-written inline SVG using `currentColor` — no icon library.

## Manual test flow

Open at a mobile viewport (~390×844). **First run (onboarding):** tap anywhere to begin (unlocks audio) → Margo introduces herself → speak your name when prompted (mic auto-starts; tap "That's …" after a pause) → speak your first entry (timer counts up, live transcript shows; tap "I'm done" after a pause) → Mirror Moment replays your words, highlights phrases, and reveals the Pattern Reveal card → tap **Start Noticing** to enter the journaling app. Onboarding only shows once (persisted in `localStorage`; clear `margo:onboardingComplete` to see it again, or set `VITE_SKIP_ONBOARDING=1` to skip it). **Journaling app:** tap the orb to **Start Entry** → answer by mic (grant mic permission; Scribe transcribes live — requires `ELEVENLABS_API_KEY`) or the keyboard toggle → tap "next" for AI-generated follow-ups → **finish** (check mark) → confirm loading ("Wrapping up your entry…") → reflection generated from what you said (summary, patterns, atom graph, next steps; needs `ANTHROPIC_API_KEY`, else mocks) → optionally **Start daily practice** (the 4-step practice) → back home. From the idle home screen, the bottom-right icon opens **History** (past entries → tap one for its detail) and the bottom-left icon opens **Insights** (range toggle + period reflection + aggregated graph).

## Note on branches

`AGENTS.md` warns that `main` once held only the README and the app lived on a `cursor/*` branch. That is now stale — the runnable app (`package.json` + `src/`) is on `main`.
