---
name: commerce-product-faq
version: 1.0.0
description: Plan and control a product_faq video that answers one concrete question with evidence and limits.
---

## Trigger
Use when the viewer has one explicit purchase or use question.

## Exclude
Do not broaden into a generic launch, multi-topic tutorial, unsupported recommendation, or absolute claim.

## Inputs
Require the exact question, supported answer/facts, evidence, limitations, next step, project/base revision, and authorization.

## Tool order

### For NEW product FAQ video (user provided product info/assets)
1. Call `video_task` with `projectId: null`, `baseRevisionId: null`, `attachmentPaths: [...]`, and FAQ video request
2. Service auto-creates project and generates FAQ video
3. If queued/running, report the real stage and stop this turn; call `video_job_status` only once when the user explicitly asks for status
4. Call `video_result` only after a real revision exists

### For EDITING existing FAQ video
1. Call `video_project_open` to get current `projectId` and `baseRevisionId`
2. Call `video_task` with `projectId`, `baseRevisionId`, and edit request
3. Call `video_job_status` once only when status was requested or the task is terminal; call `video_result` only after a real revision exists

**Key: User provides product assets → NEW project with projectId:null**

## Output
Return question/answer/evidence mapping, editable text, real job/revision, candidate video, and review state.

## Preserve
Preserve the exact question scope, qualifications, product identity, source ranges, audio, and unmentioned objects.

## Failure
State that the answer is unsupported or ask one minimal clarification; never replace evidence with category assumptions.

## Acceptance
The video answers the stated question, shows supporting evidence, and visibly communicates material limitations. Source: `commerce/scenes/product-faq/`.
