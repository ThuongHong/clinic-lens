# Git Workflow

## Branching Strategy

- `main`: final submission only.
- `dev`: integration branch.
- Feature branches should be short-lived and focused on either `backend/` or `frontend/`.

## Workflow

1. Create a feature branch from `dev`.
2. Make changes in a narrow scope.
3. Run the relevant local checks.
4. Open a PR back into `dev`.
5. Merge to `main` only after end-to-end verification.

## Suggested Checks

- Backend: `npm start` in `backend/` and `./test-backend.sh`.
- Frontend: `npm run dev` or `npm run build` in `frontend/`.

## Conflict Rules

- Do not mix backend and frontend changes in the same branch unless the change spans both layers.
- Keep `.env` files out of git.
- If two branches touch the same contract, update backend and frontend together in one PR.
