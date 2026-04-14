# AGENTS.md

## Cursor Cloud specific instructions

### Repository overview

FiscalizaPA / TransparenciaBR is a Brazilian civic-tech platform for monitoring politicians and public spending. It is a monorepo with three components:

| Directory | Role | Stack |
|-----------|------|-------|
| `frontend/` | React SPA ("vitrine") | Vite 8, React 19, Tailwind CSS v4, Firebase Client SDK |
| `functions/` | Cloud Functions backend | Node.js 24, Firebase Functions v7, BigQuery, Stripe |
| `engines/` | Python data pipeline | Python 3.12, pandas, BigQuery, Firebase Admin, Document AI, Gemini AI |

### Node.js version

The `functions/` package requires **Node.js 24** (`"engines": {"node": "24"}` in `functions/package.json`). Use `nvm use 24` before running any npm commands. The default nvm alias is set to 24.

### Installing dependencies

Frontend dependencies have a peer dependency conflict between `@tailwindcss/vite@4.2.1` (which supports vite `^5.2.0 || ^6 || ^7`) and the project's `vite@^8.0.0`. Use `npm ci --legacy-peer-deps` in `frontend/` to install successfully.

### Running services

- **Frontend dev server:** `cd frontend && npm run dev` → serves at `http://localhost:5173/`
- **Firebase Functions emulator:** `firebase emulators:start --only functions` (from repo root) → Functions at `http://127.0.0.1:5001`, Emulator UI at `http://127.0.0.1:4000`
- **Python engines:** `cd engines && source .venv/bin/activate` then run individual scripts. These require GCP credentials (`GOOGLE_APPLICATION_CREDENTIALS`).

### Lint / Build / Test

- **Lint (frontend):** `cd frontend && npm run lint` — there are ~48 pre-existing lint errors in the codebase (unused vars, React hooks violations, etc.)
- **Build (frontend):** `cd frontend && npm run build` — produces `frontend/dist/`
- No automated test suite exists in this repository.

### External service dependencies

The platform connects to live Firebase (`fiscallizapa` project), BigQuery (`projeto-codex-br`), and Stripe. The frontend connects directly to production Firebase (no emulator toggle). The Firebase Functions emulator starts but individual function calls may fail without GCP credentials for BigQuery.

### Gotchas

- `firebase.json` has no `emulators` section; `firebase emulators:start --only functions` still works using default ports.
- The `engines/scripts/` JS scripts reuse dependencies installed in `functions/node_modules`.
- Python venv requires the `python3.12-venv` system package on Ubuntu 24.04.
