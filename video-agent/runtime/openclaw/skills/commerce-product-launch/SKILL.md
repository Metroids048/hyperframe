---
name: commerce-product-launch
version: 1.0.0
description: Plan and control a product_launch video that establishes product identity from observable evidence.
---

## Trigger
Use when the explicit business objective is introducing a product to first-time viewers.

## Exclude
Do not use for detail-only explanation, procedural tutorial, collection comparison, promotion terms, FAQ, recut, or variant.

## Inputs
Require verified product identity/facts, authorized local assets, platform/audience/output constraints, project/base revision, and authorization.

## Tool order

### For NEW product launch (user provided product info/assets)
1. Call `video_task` with `projectId: null`, `baseRevisionId: null`, `attachmentPaths: [...]`, and product launch request
2. Service auto-creates project and generates launch video
3. If queued/running, report the real stage and stop this turn; call `video_job_status` only once when the user explicitly asks for status
4. Call `video_result` only after a real revision exists

### For EDITING existing launch video
1. Call `video_project_open` to get current `projectId` and `baseRevisionId`
2. Call `video_task` with `projectId`, `baseRevisionId`, and edit request
3. Call `video_job_status` once only when status was requested or the task is terminal; call `video_result` only after a real revision exists

**Key: User provides product assets → NEW project with projectId:null**

## Output
Return the real plan/job/revision and evidence-linked native project, candidate video, source ranges, resource receipts, and review state.

## Preserve
Preserve product structure, color, supported facts, source identity, requested audio, and all unmentioned native objects.

## Failure
Shorten when meaningful footage is insufficient; do not invent identity, usage, claims, generated footage, or fixed copy.

## Acceptance
First-time viewers can identify the actual product and supported use; evidence and delivery gates pass. Source: `commerce/scenes/product-launch/`.
