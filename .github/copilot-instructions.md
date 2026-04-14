# Smart Labs Analyzer Workspace Instructions

## Scope
- This workspace has a Node.js backend in [backend/](backend/) and a Flutter app in [mobile/](mobile/).
- Keep instructions concise and link existing docs instead of duplicating them.

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

## Secrets and Environment
- Root [.env](.env) is loaded before [backend/.env](backend/.env); create root `.env` first from [.env.example](.env.example).
- Never commit `.env` or cloud credentials.
- Required backend variables: `ALI_ACCESS_KEY`, `ALI_SECRET_KEY`, `ALI_ROLE_ARN`, `OSS_REGION`, `OSS_BUCKET_NAME`, `DASHSCOPE_API_KEY`.

## Team Workflow
- Follow branch and merge discipline in [GIT_WORKFLOW.md](GIT_WORKFLOW.md).
- Do not commit directly to `main`; integrate through `dev`.
- Announce before merging shared files such as `mobile/lib/main.dart`, model files under `mobile/lib/models/`, and `.env.example`.

## Reference Docs
- Architecture and contract overview: [README.md](README.md)
- Endpoint/data flow details: [IMPLEMENTATION.md](IMPLEMENTATION.md)
- Separation and collaboration rules: [CODING_GUIDELINES.md](CODING_GUIDELINES.md)
- Flutter scaffold scope: [mobile/README.md](mobile/README.md)
- Team role split: [team_delegation.md](team_delegation.md)

## Editing Guidance
- Keep changes minimal and aligned with the existing scaffold.
- Preserve current directory ownership unless the task explicitly needs refactoring across boundaries.
