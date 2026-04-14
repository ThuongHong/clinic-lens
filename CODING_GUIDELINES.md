# Coding Guidelines

## Branching

- Do not commit directly to `main`.
- Use `dev` for integration.
- Keep frontend and backend changes isolated unless the contract changes in both places.

## Separation of Concerns

- `backend/` owns HTTP, SSE, OSS/STS, and normalization.
- `frontend/` owns web UI, upload flow, chat interaction, and history rendering.
- Shared data contracts should be updated together when schemas change.

## Contract Safety

- Keep `organ_id` and `severity` values stable.
- If you change SSE event names or payloads, update backend and frontend in the same task.

## Secrets

- Keep `.env` files out of git.
- Add new environment variables to `.env.example`.
- Never commit Alibaba Cloud credentials.
