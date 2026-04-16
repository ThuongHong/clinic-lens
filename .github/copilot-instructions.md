# Smart Labs Analyzer Workspace Instructions

## Scope
- This workspace has a Node.js backend in [backend/](backend/) and a Next.js frontend in [frontend/](frontend/).
- Keep guidance short and actionable; link to docs instead of duplicating them.

## Architecture
- Backend HTTP, SSE, STS/OSS, and model orchestration live in [backend/server.js](backend/server.js) with helpers under [backend/](backend/).
- Frontend UI lives in [frontend/app/](frontend/app/) and [frontend/components/](frontend/components/); network/upload/SSE parsing lives in [frontend/lib/](frontend/lib/).
- Shared analysis contract lives in [frontend/lib/types.ts](frontend/lib/types.ts); normalization source of truth is [backend/analysis_runtime.js](backend/analysis_runtime.js).
- Keep frontend and backend concerns separate unless changing a cross-layer contract.

## Build and Test
- Full local demo: `./start.sh`
- Backend run: `cd backend && npm install && PORT=9000 npm start`
- Backend smoke test: `./test-backend.sh http://localhost:9000`
- Backend analysis check: `cd backend && npm run analysis:test`
- Backend chat smoke check: `cd backend && npm run chat:smoke`
- Backend chat feature check: `cd backend && npm run chat:test`
- API demo flow: `./demo-api.sh`
- Frontend run/setup: see [frontend/README.md](frontend/README.md)

## API Contracts
- Preserve current backend routes unless the task explicitly changes API surface:
	`GET /health`, `GET /api/analyses`, `GET /api/sts-token`, `GET /api/sign-url`, `POST /api/analyze`, `POST /api/chat`.
- `POST /api/analyze` and `POST /api/chat` stream SSE; keep framing/event payload compatibility with [frontend/lib/backend.ts](frontend/lib/backend.ts).
- Common SSE event names in current flow: `status`, `stream`, `post_process`, `warning`, `result`, `error`.
- If SSE events or payload shapes change, update backend emitter and frontend parser in the same task.

## Contract-Critical Enums
- `organ_id`: `kidneys`, `liver`, `heart`, `lungs`, `blood`, `pancreas`, `thyroid`, `bone`, `immune`, `other`
- `severity`: `normal`, `abnormal_high`, `abnormal_low`, `critical`, `unknown`
- Keep these stable; changing values can silently break organ highlighting and filtering in UI.

## Environment and Secrets
- Env loading order is root [.env](.env) first, then [backend/.env](backend/.env); keep this behavior intact.
- Never commit `.env` or credentials.
- Required backend vars: `ALI_ACCESS_KEY`, `ALI_SECRET_KEY`, `ALI_ROLE_ARN`, `OSS_REGION`, `OSS_BUCKET_NAME`, `DASHSCOPE_API_KEY`.
- Optional backend model selectors: `DASHSCOPE_EXTRACT_MODEL`, `DASHSCOPE_SUMMARY_MODEL`, `DASHSCOPE_CHAT_MODEL`.
- Keep `OSS_REGION` in OSS format (for example `oss-cn-hangzhou`).

## Team Workflow
- Follow [GIT_WORKFLOW.md](GIT_WORKFLOW.md): do not commit directly to `main`; integrate through `dev`.
- If changing shared contracts (`frontend/lib/types.ts`, SSE payloads, normalization), update backend and frontend together.
- If adding/changing env vars, update [.env.example](.env.example) in the same PR.

## Common Pitfalls
- Prompt/runtime drift can break strict JSON parsing. Keep these aligned when changing output behavior:
	[backend/prompts/analysis_system_prompt.md](backend/prompts/analysis_system_prompt.md),
	[backend/analysis_runtime.js](backend/analysis_runtime.js),
	[frontend/lib/types.ts](frontend/lib/types.ts).
- PDF analysis uses Python tooling and can time out on large files; validate with backend analysis scripts in [backend/package.json](backend/package.json).

## Reference Docs
- Overview and setup: [README.md](README.md)
- API/data flow details: [IMPLEMENTATION.md](IMPLEMENTATION.md)
- Separation and contracts: [CODING_GUIDELINES.md](CODING_GUIDELINES.md)
- Frontend setup and env: [frontend/README.md](frontend/README.md)
- Team coordination: [team_delegation.md](team_delegation.md)

## Specialized Instructions
- Backend API/SSE/normalization guardrails: [.github/instructions/backend.instructions.md](.github/instructions/backend.instructions.md)
