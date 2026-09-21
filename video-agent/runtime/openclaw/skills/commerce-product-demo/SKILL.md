---
name: commerce-product-demo
version: 1.0.0
description: Plan and control a product_demo video whose real actions can be understood and reproduced.
---

## Trigger
Use for explicit how-to, setup, operation, or use-flow objectives.

## Exclude
Do not use when required actions or completion evidence are absent; still images cannot impersonate motion steps.

## Inputs
Require observable preparation, ordered action evidence, completion state, cautions supported by facts, project/base revision, and authorization.

## Tool order

### For NEW product demo video (user provided product info/assets)
1. Call `video_task` with `projectId: null`, `baseRevisionId: null`, `attachmentPaths: [...]`, and demo video request
2. Service auto-creates project and generates demo video
3. If queued/running, report the real stage and stop this turn; call `video_job_status` only once when the user explicitly asks for status
4. Call `video_result` only after a real revision exists

### For EDITING existing demo video
1. Call `video_project_open` to get current `projectId` and `baseRevisionId`
2. Call `video_task` with `projectId`, `baseRevisionId`, and edit request
3. Call `video_job_status` once only when status was requested or the task is terminal; call `video_result` only after a real revision exists

**Key: User provides product assets → NEW project with projectId:null**

## Output
Return ordered step/source ranges, dependencies, captions, native objects, real job/revision, video, and review evidence.

## Preserve
Preserve necessary action duration/order, source audio synchronization, supported warnings, facts, and unmentioned objects.

## Failure
Report missing steps or shorten the claim; never call a sequence complete when start, required action, or completion evidence is missing.

## Acceptance
A new user can follow only the visible supported sequence, and every claimed step maps to inspected source evidence. Source: `commerce/scenes/product-demo/`.
