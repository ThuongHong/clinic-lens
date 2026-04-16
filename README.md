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

## Deploy on Alibaba Cloud ECS (Docker)

1. Copy Alibaba env template:

```bash
cp .env.alibabacloud.example .env
```

2. Edit `.env` with your real Alibaba credentials and set `NEXT_PUBLIC_BACKEND_BASE_URL`.

3. Deploy with one command from repository root:

```bash
docker compose --profile proxy up -d --build
```

This runs a reverse proxy as the only public entrypoint. Frontend and backend stay private on the internal Docker network.

4. Validate services:

```bash
docker compose ps
curl -f http://127.0.0.1:${PUBLIC_HTTP_PORT:-80}/healthz
```

Detailed ECS guide: [DEPLOY_ALIBABACLOUD_ECS.md](DEPLOY_ALIBABACLOUD_ECS.md)
