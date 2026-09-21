---
name: commerce-product-detail
version: 1.0.0
description: Plan and control a product_detail video that explains purchase-relevant structure using concrete evidence.
---

## Trigger
Use when viewers already know the product and need structure, material, interface, or supported purchase details.

## Exclude
Do not substitute launch mood, unsupported claims, generic beauty shots, or tutorial steps for missing detail evidence.

## Inputs
Require the named concern, verified facts, close/overview evidence, local resources, project/base revision, keep-set, and authorization.

## Tool order

### For NEW product detail video (user provided product info/assets)
1. Call `video_task` with `projectId: null`, `baseRevisionId: null`, `attachmentPaths: [...]`, and detail video request
2. Service auto-creates project and generates detail video
3. If queued/running, report the real stage and stop this turn; call `video_job_status` only once when the user explicitly asks for status
4. Call `video_result` only after a real revision exists

### For EDITING existing detail video
1. Call `video_project_open` to get current `projectId` and `baseRevisionId`
2. Call `video_task` with `projectId`, `baseRevisionId`, and edit request
3. Call `video_job_status` once only when status was requested or the task is terminal; call `video_result` only after a real revision exists

**Key: User provides product assets → NEW project with projectId:null**

## Output
Return real detail-to-source mappings, editable objects, job/revision, candidate video, artifacts, and review state.

## Preserve
Preserve geometry, labels, factual limits, legibility, source intervals, audio, and unrequested objects.

## Failure
Mark an unsupported detail as a gap or clarify it; never infer it from a filename, single cover, or product category.

## Acceptance
Every purchase point has visible evidence and readable conditions without obscuring the product. Source: `commerce/scenes/product-detail/`.
