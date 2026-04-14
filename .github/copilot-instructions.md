# Smart Labs Analyzer Workspace Instructions

## Scope
- This workspace has a Node.js backend in [backend/](backend/) and a Flutter app in [mobile/](mobile/).
- Keep instructions concise and link existing docs instead of duplicating them.

## Tech Stack
- Backend: Node.js + Express ([backend/server.js](backend/server.js))
- AI inference/orchestration: DashScope Qwen + runtime normalization ([backend/analysis_runtime.js](backend/analysis_runtime.js))
- Mobile app: Flutter screens/widgets/services/models under [mobile/lib/](mobile/lib/)
- Storage/auth: Alibaba OSS + STS token flow via backend routes
- Streaming: Server-Sent Events from `POST /api/analyze`

## Architecture Boundaries
- Keep backend HTTP and AI orchestration in [backend/server.js](backend/server.js) and backend helpers under [backend/](backend/).
- Keep Flutter UI in [mobile/lib/screens/](mobile/lib/screens/) and [mobile/lib/widgets/](mobile/lib/widgets/).
- Keep API/upload/network logic in [mobile/lib/services/](mobile/lib/services/).
- Keep shared contracts and app models in [mobile/lib/models/](mobile/lib/models/).
- Do not mix backend concerns into Flutter widgets, and do not move UI concerns into backend handlers.

## Build and Test Commands
- Backend run: `cd backend && npm install && PORT=9000 npm start`
- Backend smoke tests: `./test-backend.sh http://localhost:9000`
- Full demo bootstrap: `./start.sh`
- Backend analysis script: `cd backend && npm run analysis:test`
- Flutter setup/run: follow [FLUTTER_SETUP.md](FLUTTER_SETUP.md)

## API and Contract Conventions
- Backend routes in current server: `GET /health`, `GET /api/analyses`, `GET /api/sts-token`, `GET /api/sign-url`, `POST /api/analyze`.
- `POST /api/analyze` streams Server-Sent Events; preserve the SSE event shape consumed by Flutter services.
- Preserve the normalized data contract used by Flutter, especially `organ_id` and `severity` values.
- If changing output normalization, update backend runtime logic and Flutter parsing together.
- Source of truth for normalization and aliases: [backend/analysis_runtime.js](backend/analysis_runtime.js).

### Contract-Critical Enums
- `organ_id`: `kidneys`, `liver`, `heart`, `lungs`, `blood`, `pancreas`, `thyroid`, `bone`, `immune`, `other`
- `severity`: `normal`, `abnormal_high`, `abnormal_low`, `critical`, `unknown`

### SSE Compatibility
- Keep SSE framing compatible with Flutter parser in [mobile/lib/services/backend_api.dart](mobile/lib/services/backend_api.dart).
- Event types currently used by backend/Flutter flow: `status`, `stream`, `post_process`, `warning`, `result`, `error`.
- If event names/payloads change, update backend emitter and Flutter parser in the same task.

## Secrets and Environment
- Root [.env](.env) is loaded before [backend/.env](backend/.env); create root `.env` first from [.env.example](.env.example).
- Never commit `.env` or cloud credentials.
- Required backend variables: `ALI_ACCESS_KEY`, `ALI_SECRET_KEY`, `ALI_ROLE_ARN`, `OSS_REGION`, `OSS_BUCKET_NAME`, `DASHSCOPE_API_KEY`.
- Keep `OSS_REGION` in OSS format (for example `oss-cn-hangzhou`).

## Common Pitfalls
- Android emulator must call backend at `http://10.0.2.2:9000` (not `localhost`) as implemented in [mobile/lib/services/backend_api.dart](mobile/lib/services/backend_api.dart).
- Breaking `organ_id`/`severity` values can silently degrade organ highlighting in UI panels.
- Prompt/output drift can break strict JSON parsing; align prompt/runtime/model parsing together:
	[backend/prompts/analysis_system_prompt.md](backend/prompts/analysis_system_prompt.md),
	[backend/analysis_runtime.js](backend/analysis_runtime.js),
	[mobile/lib/models/lab_analysis.dart](mobile/lib/models/lab_analysis.dart)
- PDF analysis path depends on Python tooling and can time out on large files; validate with backend analysis scripts in [backend/package.json](backend/package.json).

## Team Workflow
- Follow branch and merge discipline in [GIT_WORKFLOW.md](GIT_WORKFLOW.md).
- Do not commit directly to `main`; integrate through `dev`.
- Announce before merging shared files such as `mobile/lib/main.dart`, model files under `mobile/lib/models/`, and `.env.example`.

## Coordination Checklist
- If changing `/api/*` behavior or SSE payloads, verify [mobile/lib/services/backend_api.dart](mobile/lib/services/backend_api.dart) still parses and updates UI flow.
- If changing normalization logic or enum values, update backend runtime and Flutter model/UI usage together.
- If adding/changing env vars, update [.env.example](.env.example) and relevant docs/instructions in the same PR.

## Reference Docs
- Architecture and contract overview: [README.md](README.md)
- Endpoint/data flow details: [IMPLEMENTATION.md](IMPLEMENTATION.md)
- Separation and collaboration rules: [CODING_GUIDELINES.md](CODING_GUIDELINES.md)
- Flutter scaffold scope: [mobile/README.md](mobile/README.md)
- Team role split: [team_delegation.md](team_delegation.md)

## Specialized Instructions
- Backend API/SSE/normalization work: [.github/instructions/backend.instructions.md](.github/instructions/backend.instructions.md)
- Flutter screen/widget work: [.github/instructions/flutter-ui.instructions.md](.github/instructions/flutter-ui.instructions.md)

## Editing Guidance
- Keep changes minimal and aligned with the existing scaffold.
- Preserve current directory ownership unless the task explicitly needs refactoring across boundaries.
