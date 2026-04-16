---
name: system-architecture
description: 'Understand and navigate project architecture quickly and accurately. Use when planning or editing backend routes, SSE streaming, frontend data flow, analysis normalization, or cross-layer contracts.'
argument-hint: 'Focus area: overview | backend | frontend | contracts | data-flow'
user-invocable: true
---

# System Architecture

## What This Skill Produces
- A fast architecture map of the ClinicLens workspace.
- Correct edit boundaries (backend-only, frontend-only, or cross-layer).
- Contract-safe change plan that preserves SSE and analysis schema compatibility.
- Execution guidance optimized for accuracy and efficiency.

## When To Use
- Before implementing any feature that touches API routes, SSE, analysis output, or frontend parsing.
- When debugging mismatches between displayed UI fields and analysis/history data.
- When you need to decide where a change belongs: backend, frontend, or both.

## Operating Priorities
- Accuracy first: preserve API/SSE/type contracts and avoid schema drift.
- Efficiency second: keep changes minimal, scoped, and validated quickly.
- Avoid speculative refactors outside the requested scope.

## Mandatory Pre-Check For Backend Work
- Before any backend edit, read and follow `.github/instructions/backend.instructions.md`.
- If backend changes can affect frontend contracts, update frontend parser/types in the same task.

## Project Structure Snapshot
- Backend core: `backend/server.js`
- Backend normalization and runtime contract: `backend/analysis_runtime.js`
- Backend prompt source: `backend/prompts/analysis_system_prompt.md`
- Frontend app shell and tabs: `frontend/components/smart-labs-app.tsx`
- Frontend SSE parsing and HTTP calls: `frontend/lib/backend.ts`
- Frontend shared analysis types: `frontend/lib/types.ts`
- Team docs and architecture references:
  - `README.md`
  - `IMPLEMENTATION.md`
  - `CODING_GUIDELINES.md`
  - `.github/instructions/backend.instructions.md`

## Step-by-Step Workflow
1. Identify target scope.
- Backend-only: route handlers, SSE emitters, normalization, STS/OSS integration.
- Frontend-only: rendering, layout, local/session state, component UX.
- Cross-layer: any payload or event shape changes.

1.1 Backend guardrail gate (required).
- If scope includes backend, load `.github/instructions/backend.instructions.md` before editing.
- Confirm route, SSE, and normalization constraints from that instruction file.

2. Trace data path from source to UI.
- Source file/object key -> backend stream -> SSE event payload -> frontend parser -> state -> rendered fields.
- For metadata bugs, verify each hop uses the same source of truth.

3. Validate contract-critical interfaces before editing.
- API routes expected:
  - `GET /health`
  - `GET /api/analyses`
  - `GET /api/sts-token`
  - `GET /api/sign-url`
  - `POST /api/analyze`
  - `POST /api/chat`
- SSE events expected in current flow:
  - `status`, `stream`, `post_process`, `warning`, `result`, `error`

4. Apply edits in the correct layer.
- If payload shape changes in backend, update frontend parser/types in the same task.
- If only UI display binding is wrong, fix frontend state derivation first.

5. Run completion checks.
- Type checks / lint errors: no new errors in changed files.
- SSE compatibility: frontend still parses backend events.
- Field consistency: patient/source/test date/status align with the currently selected analysis.
- No enum drift for contract-critical fields:
  - `organ_id`: `kidneys`, `liver`, `heart`, `lungs`, `blood`, `pancreas`, `thyroid`, `bone`, `immune`, `other`
  - `severity`: `normal`, `abnormal_high`, `abnormal_low`, `critical`, `unknown`

## Decision Points
- If changing SSE event names or payload shape:
  - Update both backend emitter and frontend parser/types immediately.
- If issue is stale/misaligned metadata in UI:
  - Prefer deriving display values from active history/analysis record, not transient file picker state.
- If adding environment variables:
  - Update `.env.example` in the same change.

## Quality Bar
- No silent contract breaks.
- No frontend-backend drift in analysis schema.
- User-facing metadata reflects the exact analysis currently displayed.
- Changes are minimal and scoped to the responsible layer unless contract updates require cross-layer edits.
- Backend edits are compliant with `.github/instructions/backend.instructions.md`.
