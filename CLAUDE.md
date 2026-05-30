# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Margo** — a frontend-only React + Vite + TypeScript prototype of a voice-journaling mobile app, styled with Tailwind CSS v4 and animated with `motion` (Framer Motion). It implements a Figma mockup; there is **no app backend** — but three AI features are real: **speech-to-text** (ElevenLabs Scribe v2 Realtime), **text-to-speech** for Margo's voice in onboarding (ElevenLabs TTS), and the **reflection / onboarding insight** (an LLM generates the summary/patterns/next-steps and the first-entry "Pattern Reveal" from the transcript). AI follow-up questions are still mocked. The app is designed for a mobile viewport (390×844) and renders a phone-shaped frame centered on any screen.

## Commands

```bash
npm install          # Node 22+
npm run dev          # Vite dev server, http://localhost:5173
npm run dev -- --host 0.0.0.0   # expose outside a container (Cloud Agent VMs)
npm run build        # tsc -b && vite build (this is the typecheck + build gate)
npm run preview      # serve the production bundle
```

There is **no lint, formatter, or test runner configured**. `npm run build` is the only verification gate — TypeScript runs in `strict` mode with `noUnusedLocals`/`noUnusedParameters`, so unused symbols fail the build.

## Speech-to-text (ElevenLabs Scribe)

Live transcription is wired to **ElevenLabs Scribe v2 Realtime** (`@elevenlabs/client`).

- **`src/useScribe.ts`** — React hook owning one Scribe WebSocket per recording session. It fetches a single-use token, opens `Scribe.connect({ modelId: "scribe_v2_realtime", commitStrategy: VAD, microphone: {...} })`, and forwards `partial_transcript` / `committed_transcript` events to `setPersonTranscript`.
- **`vite-plugins/scribeToken.ts`** — dev/preview middleware serving `POST /api/scribe-token`. It exchanges the server-side `ELEVENLABS_API_KEY` for a short-lived (~15 min) single-use token via `https://api.elevenlabs.io/v1/single-use-token/realtime_scribe`. The raw key never reaches the browser. **In production, replace this with a real serverless route at the same path.**
- **Env:** copy `.env.example` → `.env` and set `ELEVENLABS_API_KEY`. The var is intentionally **not** `VITE_`-prefixed so Vite never inlines it into the client bundle. Restart the dev server after editing `.env`. Without a key, the mic UI works but shows a "key not set" error in the transcript area.

## Reflection generation (LLM)

When an entry finishes, the reflection (summary / patterns / next steps) is generated from the journal transcript by an LLM (Anthropic `claude-sonnet-4-6` by default).

- **`src/useReflection.ts`** — hook exposing `generate(transcript)` + `reflection`. POSTs the transcript to `/api/reflection` and uses the real model response. On an empty transcript, a non-OK response, or a request failure it records an `error` and leaves the reflection empty (no mock fallback). Also exports the `Reflection` type.
- **`vite-plugins/reflection.ts`** — dev/preview middleware serving `POST /api/reflection`. Holds the server-side `ANTHROPIC_API_KEY`, calls the Claude Messages API with a JSON-only system prompt, and validates/normalizes (tolerant JSON extraction) the model output before returning it. **In production, replace with a real serverless route at the same path** (swap provider/model here as needed).
- **Transcript:** `Frame.tsx` accumulates each spoken turn (`recordTurn`) into `transcriptLog`; `handleFinishEntry` joins it and runs generation in parallel with the minimum loading delay, advancing to `reflection` only once both settle.
- **Env:** `ANTHROPIC_API_KEY` (server-side only, no `VITE_` prefix). Unset → mock fallback (fine for demos).

The same `/api/reflection` proxy also serves the **onboarding insight** when called with `mode: "insight"` (and optionally `name`): it returns a different JSON shape (`transitionLine`, `coreQuestion`, `summaryLine`, `triggers[]`, `margoQuestion`, `highlightPhrases[]`) via `INSIGHT_SYSTEM_PROMPT` + `normalizeInsight`. `src/useInsight.ts` wraps this with a `MOCK_INSIGHT` fallback.

## Text-to-speech (Margo's voice, onboarding)

Margo speaks her onboarding lines with **real ElevenLabs TTS**.

- **`src/useMargoVoice.ts`** — hook exposing `speak(text)`, `prefetch(text)` (warm upcoming audio to hide latency), `unlock()` (play a silent clip on first user gesture to satisfy browser autoplay policy), `stop()`, and `speaking`. Caches fetched audio by text; if TTS fails it degrades gracefully (resolves after an estimated duration so the flow keeps advancing without sound).
- **`vite-plugins/tts.ts`** — dev/preview middleware serving `POST /api/tts`. Holds the server-side `ELEVENLABS_API_KEY`, calls ElevenLabs TTS, and streams `audio/mpeg` back. **In production, replace with a real serverless route at the same path.**
- **Env:** `ELEVENLABS_API_KEY` (shared with STT) and optional `ELEVENLABS_VOICE_ID`. Server-side only, no `VITE_` prefix.

## Architecture

The entire app is a single client-side state machine living in `src/Frame.tsx`. There is no router. `Frame` drives a `phase` state through five screens, transitioned with `<AnimatePresence mode="wait">`:

```
onboarding → entry → loading → reflection → practice → (back home resets to entry)
```

New users start in `onboarding`; returning users (who have `margo:onboardingComplete` set in `localStorage`) skip straight to `entry`.

- **`onboarding`** — `Onboarding.tsx`, the voice-first "Your First Mirror Moment" flow. One continuous conversation with five sub-steps (`entrance → name → firstYap → mirror → invitation`). Margo speaks with real ElevenLabs TTS (`useMargoVoice`), the user speaks their name and first entry (real ElevenLabs Scribe STT via `useScribe`), and Claude generates a "Pattern Reveal" insight (`useInsight` → `/api/reflection` in `insight` mode). Advancement is **tap-to-continue**: the mic auto-starts after Margo finishes speaking, and a tap prompt appears only after a first natural pause is detected. Captured name + completion flag persist via `useOnboarding` (`localStorage`). Finishing ("Start Noticing" or "Save & Exit") sets `onboardingComplete` and enters `entry`.
- **`entry`** — the voice-journaling conversation. Its own sub-state-machine via `bulbState: "idle" | "aiSpeaking" | "personSpeaking"`. `aiSay()` shows a question and sets `aiSpeaking`; `listen()` sets `personSpeaking`. The mic toggle advances through the `QUESTIONS` bank; while recording, the `useScribe` hook streams **real** speech-to-text from ElevenLabs into `setPersonTranscript`.
- **`loading`** — white "preparing" screen shown while the reflection generates. It waits for **both** a minimum delay (`LOADING_MS`, 1900ms) **and** the generation promise before flipping to `reflection`.
- **`reflection`** — `ReflectionView`, fed the generated reflection from `useReflection` (summary + patterns + nextSteps). `EntryGraph` renders an Obsidian-style node graph here.
- **`practice`** — `PracticeView`, the daily-practice flow; "back home" resets all entry state.

### Where to plug in a real backend

`Frame.tsx` is the integration seam. Speech-to-text (`useScribe`) and reflection generation (`useReflection`) are **already wired**. What remains mocked: the `QUESTIONS` bank and the `onNextPrompt` handler (the conversational AI that picks follow-up questions). The `aiSay`/`listen` callbacks and `QUESTIONS` define the shapes a real conversational backend should produce.

### Components (`src/`)

`BulbAvatar` (the animated "AI" orb, driven by `BulbState`), `Controls` (mic/next/finish buttons with inline SVG icons), `MargoLogo`, `EntryGraph`, `ReflectionView`, `PracticeView`, `Onboarding` (the voice-first onboarding flow + its `EntranceStep`/`NameStep`/`FirstYapStep`/`MirrorStep`/`InvitationStep` sub-steps), and `InsightCard` (the "Pattern Reveal" card). Supporting utilities/hooks: `useMargoVoice`, `useInsight`, `useOnboarding`, and `highlight.ts` (tolerant phrase matching for the Mirror Moment highlights). Components export their prop/state types (e.g. `BulbState`, `ReflectionViewProps`) for `Frame` to consume.

## Conventions

- **Styling is inline Tailwind utility classes**, including arbitrary values straight from the Figma design — exact hex colors (`text-[#1c2b33]`), pixel sizes (`pt-[118px]`), gradients, and `[font-family:'Inter',Helvetica]`. Match this verbatim-from-design style when editing; don't refactor magic numbers into tokens unless asked.
- **Animation is `motion/react`** throughout — `motion.*` elements, `Variants` keyed by state name, and `AnimatePresence` for mount/unmount transitions. New screen transitions should follow the existing `AnimatePresence mode="wait"` + `key` pattern in `Frame`.
- Inter is loaded from the Google Fonts CDN in `index.html`; offline runs fall back to system fonts.
- Icons are hand-written inline SVG using `currentColor` — no icon library.

## Manual test flow

Open at a mobile viewport (~390×844). **First run (onboarding):** tap anywhere to begin (unlocks audio) → Margo introduces herself → speak your name when prompted (mic auto-starts; tap "That's …" after a pause) → speak your first entry (timer counts up, live transcript shows; tap "I'm done" after a pause) → Mirror Moment replays your words, highlights phrases, and reveals the Pattern Reveal card → tap **Start Noticing** to enter the journaling app. Onboarding only shows once (persisted in `localStorage`; clear `margo:onboardingComplete` to see it again). **Journaling app:** tap **Start Entry** → use the mic (grant mic permission; Scribe transcribes your speech live — requires `ELEVENLABS_API_KEY`) → advance through questions → **finish** → confirm loading ("Wrapping up your entry…") → reflection generated from what you said (summary, patterns, graph; needs `ANTHROPIC_API_KEY`, else a mock shows) → optionally **Start daily practice** → back home.

## Note on branches

`AGENTS.md` warns that `main` once held only the README and the app lived on a `cursor/*` branch. That is now stale — the runnable app (`package.json` + `src/`) is on `main`.
