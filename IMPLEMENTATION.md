# Smart Labs Analyzer - Implementation Summary

## Architecture

- Frontend: [frontend/](frontend/) built with Next.js.
- Backend: [backend/](backend/) with Node.js + Express.
- Storage: Alibaba Cloud OSS with STS-based direct upload.
- Streaming: SSE from `POST /api/analyze` and `POST /api/chat`.

## Backend Workflow

### `GET /api/sts-token`

- Returns temporary Alibaba STS credentials.
- Used by the web frontend to upload directly to OSS.

### `GET /api/sign-url?object_key=...&expires_in=600`

- Creates a short-lived signed URL for private OSS objects.

### `POST /api/analyze`

- Accepts uploaded file references and streams analysis output as SSE.

### `POST /api/chat`

- Accepts a selected history entry plus follow-up question.
- Streams assistant text and final structured payload as SSE.

### `GET /health`

- Health check endpoint.

## Data Contract

The backend normalizes lab analysis responses around:

- `organ_id`: `kidneys`, `liver`, `heart`, `lungs`, `blood`, `pancreas`, `thyroid`, `bone`, `immune`, `other`
- `severity`: `normal`, `abnormal_high`, `abnormal_low`, `critical`, `unknown`

## How to Run

Backend:

```bash
cd backend
npm install
npm start
```

Frontend:

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

## Current Status

- Backend API and SSE flow are complete.
- Web frontend is the primary UI.
