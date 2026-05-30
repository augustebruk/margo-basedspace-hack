# Margo

**Margo** is a frontend-only React + Vite + TypeScript prototype of a voice-first
journaling app for a mobile viewport (390 × 844). You think out loud; Margo
listens, asks gentle follow-up questions, then reflects what she heard back to
you — a summary, the patterns she noticed, a personalized practice, and an
"atom graph" that connects the people, situations, and feelings you keep
mentioning across entries.

There is **no app backend**, but several features are backed by real AI through
small Vite dev/preview proxies (the keys stay server-side):

- **Speech-to-text** — ElevenLabs Scribe v2 Realtime (live transcription).
- **Text-to-speech** — ElevenLabs TTS (Margo's spoken voice during onboarding).
- **LLM generation** (Anthropic Claude) — the onboarding "Pattern Reveal"
  insight, each entry's reflection, the live follow-up questions, tonight's
  personalized practice, and the cross-entry "Insights" period reflection.

## Getting started

Requires Node 22+.

```bash
npm install
npm run dev                     # Vite dev server, http://localhost:5173
npm run dev -- --host 0.0.0.0   # expose outside a container (Cloud Agent VMs)
npm run build                   # tsc -b && vite build (the typecheck + build gate)
npm run preview                 # serve the production bundle
```

There is **no lint, formatter, or test runner configured** — `npm run build` is
the only verification gate (TypeScript runs in `strict` mode with
`noUnusedLocals` / `noUnusedParameters`).

The app is best viewed at a mobile viewport (e.g. 390 × 844). On wider screens
the content is constrained to a phone-shaped frame centered on a light
background.

## Environment

Copy `.env.example` → `.env` and fill in the keys you have (restart the dev
server after editing). All AI features degrade gracefully without keys — the
app falls back to built-in mocks so the flow always works for demos.

| Variable | Used for | Notes |
|----------|----------|-------|
| `ELEVENLABS_API_KEY` | Speech-to-text **and** Margo's onboarding voice | Server-side only (no `VITE_` prefix). Without it, the mic UI runs but transcription shows a "key not set" error and onboarding advances without audio. |
| `ELEVENLABS_VOICE_ID` | Optional — selects Margo's TTS voice | Unset → a warm default voice. |
| `ANTHROPIC_API_KEY` | Reflection, follow-up questions, practice, insights, onboarding insight | Server-side only. Unset → built-in mocks. |
| `VITE_SKIP_ONBOARDING` | Skip the first-run onboarding flow (set to `1`) | Client-side flag — keeps the `VITE_` prefix. |
| `VITE_OVERRIDE_NAME` | Name to always use, overriding any captured name | Client-side flag. Takes precedence over the onboarding-captured name. |

## Manual test flow

1. Open at a **mobile viewport** (~390 × 844).
2. **First run — onboarding** ("Your First Mirror Moment"): tap anywhere to
   begin (unlocks audio autoplay) → Margo introduces herself → speak your name
   (tap "That's …" after the pause prompt) → speak a first journal entry (tap
   "I'm done") → watch the Mirror Moment + Pattern Reveal card → tap **Start
   Noticing**. Onboarding shows once; clear `localStorage` key
   `margo:onboardingComplete` to replay it.
3. **Journal:** tap the orb to **Start Entry** → use the mic (grant mic
   permission; Scribe transcribes live) or the keyboard, advance through
   AI-generated follow-ups, then finish the entry.
4. Confirm **loading** ("Wrapping up your entry…") → **reflection** (summary,
   patterns, atom graph, next steps).
5. Optional: **Start daily practice** → the personalized 4-step practice → back
   home.
6. From home, the bottom-corner icons open **History** (past entries) and
   **Insights** (cross-entry trends + the aggregated atom graph).

See `CLAUDE.md` for the full architecture, the AI proxy contracts, and where to
plug in a real backend.
