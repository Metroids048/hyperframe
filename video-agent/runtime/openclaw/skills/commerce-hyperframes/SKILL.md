---
name: commerce-hyperframes
version: 1.0.0
description: Bind relevant HyperFrames 0.8.33 resources to executable native video work without loading the full catalog into context.
---

## Trigger
Use when a validated plan needs an available composition, component, transition, caption, typography, effect, or shader.

## Exclude
Do not install or upgrade HyperFrames, claim a discovered name was used, inject unrestricted HTML/JS, or select a resource without runtime binding.

## Inputs
Require shot purpose, media kind, aspect, safe area, motion/audio dependencies, project/base revision, and exact local resource query.

## Tool order

### For NEW projects (user requesting video with HyperFrames effects/transitions)
1. Call `video_resource_search` with the exact shot-purpose query before production.
2. Call `video_task` with `projectId: null`, `baseRevisionId: null`, `attachmentPaths: [...]`, the prepared intent, and HyperFrames request.
3. Service auto-creates project, binds compatible HyperFrames resources, and persists a `hyperframes-resource-receipt.json` alongside the native revision.
4. If queued/running, report the real business stage without exposing internal IDs and stop this turn; call `video_job_status` only once when the user explicitly asks for status.
5. Call `video_result` only after a real revision exists and then verify receipts, selected resource IDs, versions, and render evidence.

### For EDITING existing project with HyperFrames
1. Call `video_project_open` to get current `projectId` and `baseRevisionId`
2. Call `video_task` with `projectId`, `baseRevisionId`, and HyperFrames composition request
3. Call `video_job_status` once only when status was requested or the task is terminal
4. Call `video_result` only after a real revision exists

**Key: User provides media/description → NEW project with projectId:null**

## Output
Return selected resource names/counts, versions, runtime bindings, affected shots, compiled native project, and render evidence. Keep job/revision IDs internal unless diagnostics were explicitly requested.

## Preserve
Keep HyperFrames pinned to 0.8.33, source media/facts, object editability, safe areas, audio timing, and unselected objects.

## Failure
Treat discovery without runtime binding, compile failure, blank render, or missing receipt as failure; choose no resource rather than inventing one.

## Acceptance
The actual project receipt proves the selected resource executed in the correct object/shot and the rendered pixels are nonblank. Source: `config/hyperframes/` and `config/skills/hyperframes*.md`.
