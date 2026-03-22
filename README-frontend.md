# ReVolt OS — Frontend

> **This branch is frontend only.**
> The server code lives on `main` / the backend branch. This won't fully work without it — read below.

---

## What this is

ReVolt OS is a Circular Economy platform for SME battery repurposing. It generates AI-audited **Digital Battery Passports** from a telemetry CSV + sticker photo, and provides a voice-guided assembly agent for technicians handling high-voltage EV batteries.

Three pages:

| Route | Page | What it does |
|---|---|---|
| `/audit` | AuditPage | Upload battery sticker + telemetry CSV, trigger Gemini audit |
| `/passport/:id` | PassportPage | Rendered Battery Passport with health grade, QR, EU compliance badge |
| `/assembly` | AssemblyPage | ElevenLabs voice agent + 6-step safety checklist |

---

## Running without the backend (mock mode)

The frontend ships with mock data so you can develop and demo without the FastAPI server running.

```bash
cd client
npm install
npm run dev
```

`USE_MOCK = true` in `client/src/mocks/manifest.mock.js` — the audit page skips the real API call and navigates straight to PassportPage with a sample BMW i3 manifest. **Flip it to `false` when the backend is live.**

---

## Running with the backend

You need the server running on port 8000. That code is on `main`/backend — clone it separately, set up your `.env`, and run:

```bash
# Terminal 1 — backend (from main branch)
cd server
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Terminal 2 — frontend (this branch)
cd client
npm install
npm run dev
```

Vite proxies all `/api/*` requests to `localhost:8000` automatically — no CORS config needed in dev.

---

## What the backend provides

| Endpoint | Used by |
|---|---|
| `POST /api/audit` | AuditPage — submits sticker image + CSV, gets manifest JSON back |
| `GET /api/batteries/:id` | PassportPage — deep-link / QR scan support (needs MongoDB) |
| `POST /api/batteries/:id/log-milestone` | AssemblyPage — ElevenLabs agent tool call |
| `POST /api/batteries/:id/complete-assembly` | AssemblyPage — saves verified assembly record |

Until those endpoints are live, the frontend degrades gracefully:
- Audit → runs in mock mode
- Passport deep-links → shows "not found" error
- Assembly completion → saves locally, badge shows "pending verification"

---

## Tech stack

- **React 19** + **Vite 8**
- **React Router v7**
- **Tailwind CSS v4**
- **react-qr-code** — QR generation
- **Web Audio API** — real mic input for the oscilloscope visualizer
- Theme: macOS Aqua / Y2K industrial (2001-era OS chrome)

---

## Environment

No `.env` needed for the frontend in mock mode. When pointing at a live backend, Vite's proxy handles routing — still no frontend env vars required.

---

## File structure

```
client/
  src/
    pages/
      AuditPage.jsx       # Page 1 — file upload + audit trigger
      PassportPage.jsx    # Page 2 — rendered passport
      AssemblyPage.jsx    # Page 3 — voice agent + checklist
    components/
      PassportCard.jsx    # Reusable passport display card
    mocks/
      manifest.mock.js    # Static mock manifest + USE_MOCK flag
    index.css             # Global styles, CSS vars, Aqua theme
    App.jsx               # Router
```
