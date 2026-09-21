---
name: commerce-general
version: 1.0.0
description: Control an evidence-bound video request that has no supported specialized commerce scene, including new projects and edits.
---

## Trigger
Use for a concrete video request or packaging/edit request with no explicit launch, detail, demo, collection, promotion, or FAQ objective.

## Exclude
Do not default general requests to product launch or use general to bypass scene, tool, provider, network, file, or quality restrictions.

## Inputs
Require the exact task and any observable assets available. Current project/native objects, base revision, keep-set, and authorization are supplied when continuing an existing project; they are not prerequisites for a new request.

## Tool order

### For NEW video projects (with or without files)
1. Call `video_task` with `projectId: null`, `baseRevisionId: null`, optional `attachmentPaths: [...]`, and the user's request
2. Service auto-creates project and returns `projectId`, `baseRevisionId`, `jobId`
3. If the job is queued/running, report the real stage and stop this turn; call `video_job_status` only once when the user explicitly asks for status
4. Call `video_result` only after a real revision exists

### For EDITING existing projects
1. Call `video_project_open` with `projectId` to get current `baseRevisionId`
2. Call `video_task` with `projectId`, `baseRevisionId`, and the edit request
3. Call `video_job_status` once only when status was requested or the task is terminal; call `video_result` only after a real revision exists

**Key principle: A task can start without a project. A fresh upload is a NEW project request with `projectId:null`; a text-only request is also valid and should be persisted before reporting any concrete missing capability or media.

## Output
Return actual source ranges, resources, native project, job/revision, candidate video, and separated machine/human review state.

## Preserve
Preserve subject, action, source ratio, facts, source audio, all unrequested objects, and the mother revision for variants.

## Failure
Refuse or leave unresolved unsupported 3D reconstruction, missing actions, unrestricted code, or paused generation; never substitute a 2D approximation silently.

## Acceptance
The exact requested edit is visible and editable, with source/resource receipts and no invented marketing objective. Source: `commerce/scenes/general/scene.json`.
