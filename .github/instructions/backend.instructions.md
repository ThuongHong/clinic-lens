---
description: "Use when editing backend APIs, SSE streaming, route handlers, analysis normalization, Alibaba STS/OSS integration, or Node.js server logic under backend/. Preserve Flutter-facing contracts and endpoint behavior."
name: "Backend API and Contract Guardrails"
applyTo:
  - "backend/**/*.js"
  - "backend/**/*.json"
---
# Backend API and Contract Guardrails

- Keep HTTP and orchestration logic centralized in [backend/server.js](../../backend/server.js) and backend helpers under [backend/](../../backend/).
- Preserve live routes unless the task explicitly changes API surface: `GET /health`, `GET /api/analyses`, `GET /api/sts-token`, `GET /api/sign-url`, `POST /api/analyze`.
- Treat SSE shape from `POST /api/analyze` as a compatibility contract for Flutter parsing in [mobile/lib/services/backend_api.dart](../../mobile/lib/services/backend_api.dart).
- If you change output normalization (`organ_id`, `severity`, aliases), update both backend runtime logic and Flutter parsing paths together.
- Keep env loading behavior intact: root [.env](../../.env) first, then [backend/.env](../../backend/.env); never hardcode secrets.
- Preserve required env vars: `ALI_ACCESS_KEY`, `ALI_SECRET_KEY`, `ALI_ROLE_ARN`, `OSS_REGION`, `OSS_BUCKET_NAME`, `DASHSCOPE_API_KEY`.
- Keep changes minimal and local; avoid moving UI concerns into backend files.

## Run and Validation

- Start backend: `cd backend && npm install && PORT=9000 npm start`
- Smoke test: `./test-backend.sh http://localhost:9000`
- Analysis script: `cd backend && npm run analysis:test`

## References

- [IMPLEMENTATION.md](../../IMPLEMENTATION.md)
- [README.md](../../README.md)
- [CODING_GUIDELINES.md](../../CODING_GUIDELINES.md)
