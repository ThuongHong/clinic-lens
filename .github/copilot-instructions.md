# Smart Labs Analyzer Workspace Instructions

## Scope
- This repo contains a Node.js backend in [backend/](backend/) and a Flutter scaffold in [mobile/](mobile/).
- Prefer linking to existing docs instead of repeating them in comments or new guidance.

## Project Rules
- Keep backend logic in [backend/server.js](backend/server.js) and related backend helpers.
- Keep Flutter UI in [mobile/lib/screens/](mobile/lib/screens/) and [mobile/lib/widgets/](mobile/lib/widgets/).
- Keep API and upload logic in [mobile/lib/services/](mobile/lib/services/).
- Keep shared JSON contracts and models in [mobile/lib/models/](mobile/lib/models/).
- Do not mix backend concerns into Flutter widgets or UI concerns into backend handlers.

## Secrets and Environment
- Root [.env](.env) is loaded before [backend/.env](backend/.env); create the root file first.
- Never commit `.env` or cloud credentials. Use [.env.example](.env.example) as the template.
- Required backend env vars are `ALI_ACCESS_KEY`, `ALI_SECRET_KEY`, `ALI_ROLE_ARN`, `OSS_REGION`, `OSS_BUCKET_NAME`, and `DASHSCOPE_API_KEY`.

## Build and Test
- Backend start: `cd backend && npm install && PORT=9000 npm start`
- Backend smoke tests: `./test-backend.sh http://localhost:9000`
- Demo launcher: `./start.sh`
- Flutter setup and run: follow [FLUTTER_SETUP.md](FLUTTER_SETUP.md)

## Implementation Conventions
- Backend exposes `GET /health`, `GET /api/sts-token`, `GET /api/sign-url`, and `POST /api/analyze`.
- `POST /api/analyze` streams results over SSE; keep the event contract stable.
- Flutter code already uses a mock-driven flow; preserve the existing data contract around `organ_id` and `severity`.
- `AnalysisScreen` is the integration point for file selection, upload, streaming, and history.

## Team Workflow
- Follow the branch and merge discipline in [GIT_WORKFLOW.md](GIT_WORKFLOW.md).
- Avoid direct commits to `main`; integrate through `dev`.
- Announce before merging shared files such as `main.dart`, shared models, or `.env.example`.

## Good Entry Points
- [README.md](README.md) for architecture and data contract overview.
- [CODING_GUIDELINES.md](CODING_GUIDELINES.md) for team separation rules.
- [IMPLEMENTATION.md](IMPLEMENTATION.md) for endpoint and data-flow details.
- [mobile/README.md](mobile/README.md) for the Flutter scaffold scope.

## When Editing
- Keep changes minimal and aligned with the existing scaffold.
- Preserve the current file/directory split unless the task explicitly requires a refactor.
