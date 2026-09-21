---
name: commerce-product-collection
version: 1.0.0
description: Plan and control a product_collection video that distinguishes items and explains supported relationships.
---

## Trigger
Use for a series, lineup, matching, set, or comparison whose objective is understanding multiple products and their relationship.

## Exclude
Do not merge different identities, invent compatibility, or turn one item into evidence for the whole collection.

## Inputs
Require item identity groups, per-item evidence/facts, supported relationships, output constraints, project/base revision, and authorization.

## Tool order

### For NEW product collection video (user provided product info/assets)
1. Call `video_task` with `projectId: null`, `baseRevisionId: null`, `attachmentPaths: [...]`, and collection video request
2. Service auto-creates project and generates collection video
3. If queued/running, report the real stage and stop this turn; call `video_job_status` only once when the user explicitly asks for status
4. Call `video_result` only after a real revision exists

### For EDITING existing collection video
1. Call `video_project_open` to get current `projectId` and `baseRevisionId`
2. Call `video_task` with `projectId`, `baseRevisionId`, and edit request
3. Call `video_job_status` once only when status was requested or the task is terminal; call `video_result` only after a real revision exists

**Key: User provides product assets → NEW project with projectId:null**

## Output
Return item/evidence mapping, balanced source ranges, editable labels, job/revision, candidate video, and review state.

## Preserve
Preserve each item's identity, color, label, coverage, source ownership, audio, and unmentioned objects.

## Failure
Clarify ambiguous grouping and disclose missing item coverage; do not fabricate matching or use an unverified relationship.

## Acceptance
Viewers can distinguish every included item and only the relationships supported by evidence. Source: `commerce/scenes/product-collection/`.
