# Smart Labs Analyzer

Web-first lab analysis workspace for Qwen AI Build Day 2026.

## Architecture

- Frontend: [frontend/](frontend/) built with Next.js for upload, analysis streaming, chat, and history.
- Backend: [backend/](backend/) with Express, SSE streaming, STS token issuance, OSS signing, and history storage.
- Storage: Alibaba Cloud OSS with STS-based direct upload.

## What changed

- The web frontend is now the primary UI direction.
- Chat now lives in a dedicated tab and the UI avoids raw JSON/text-stream output.

## Run

Backend:

```bash
cd backend && npm install && PORT=9000 npm start
```

Frontend:

```bash
cd frontend && npm install && cp .env.example .env.local && npm run dev
```

The frontend expects `NEXT_PUBLIC_BACKEND_BASE_URL` to point at the backend, usually `http://localhost:9000` in local development.

## Notes

- `POST /api/analyze` and `POST /api/chat` both stream SSE responses.
- The frontend uploads files directly to OSS using the STS token from backend.
- If you are deploying the web app to Vercel, set `NEXT_PUBLIC_BACKEND_BASE_URL` to the deployed backend URL.
