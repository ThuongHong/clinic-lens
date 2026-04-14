---
description: "Use when editing Flutter UI screens/widgets, responsive layout, organ highlighting panels, or interaction flows in mobile/lib/screens and mobile/lib/widgets. Keep service logic in services layer."
name: "Flutter UI Boundary Guardrails"
applyTo:
  - "mobile/lib/screens/**"
  - "mobile/lib/widgets/**"
---
# Flutter UI Boundary Guardrails

- UI ownership is [mobile/lib/screens/](../../mobile/lib/screens/) and [mobile/lib/widgets/](../../mobile/lib/widgets/).
- Do not add backend/network/upload logic in UI files; keep API and transport logic in [mobile/lib/services/](../../mobile/lib/services/).
- Keep shared contract parsing in models/services, not widgets. Use [mobile/lib/models/](../../mobile/lib/models/) for data structures.
- Preserve the existing analysis flow in [mobile/lib/screens/analysis_screen.dart](../../mobile/lib/screens/analysis_screen.dart): file selection, upload, stream updates, history refresh.
- Maintain compatibility with backend SSE and normalized `organ_id`/`severity` values consumed by UI panels.
- Prefer small, localized UI edits that preserve current structure and naming.

## Collaboration Rules

- Follow team separation guidance in [CODING_GUIDELINES.md](../../CODING_GUIDELINES.md).
- Coordinate before shared-file merges such as `mobile/lib/main.dart`, model files in `mobile/lib/models/`, and [.env.example](../../.env.example).
- Follow branch workflow in [GIT_WORKFLOW.md](../../GIT_WORKFLOW.md) and integrate via `dev`, not `main`.

## Run and Validation

- Setup/run Flutter via [FLUTTER_SETUP.md](../../FLUTTER_SETUP.md)
- Keep backend contract references aligned with [IMPLEMENTATION.md](../../IMPLEMENTATION.md)

## References

- [mobile/README.md](../../mobile/README.md)
- [IMPLEMENTATION.md](../../IMPLEMENTATION.md)
- [CODING_GUIDELINES.md](../../CODING_GUIDELINES.md)
