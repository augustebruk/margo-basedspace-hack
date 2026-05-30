# AGENTS.md

## Cursor Cloud specific instructions

### Repository layout

- **`main`** currently contains only `README.md`. The runnable **Margo** React app (Vite + TypeScript) lives on **`cursor/activate-agent-mobile-6901`** (or any branch that includes `package.json` and `src/`). Check out that branch before installing dependencies or running the app.

### Services

| Service | Required? | Notes |
|--------|-----------|--------|
| **Vite dev server** | **MUST** for local dev | `npm run dev` — default http://localhost:5173. In Cloud Agent VMs, pass `--host 0.0.0.0` if the server must be reached outside the container. |
| **Vite preview** | Optional | `npm run build` then `npm run preview` for production bundle smoke tests. |
| **Backend / DB / Docker** | N/A | Not in this repo; UI uses mocked questions and reflection data in `src/Frame.tsx`. |

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
3. Use the mic control (mock STT fills the transcript), advance through questions, then finish the entry.
4. Confirm **loading** (“Wrapping up your entry…”) then **reflection** (summary, patterns, graph).
5. Optional: **Start daily practice** → practice placeholder → back to home.

Google Fonts load from the CDN in `index.html`; offline runs fall back to system UI fonts.
