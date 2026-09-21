---
name: commerce-product-promotion
version: 1.0.0
description: Plan and control a product_promotion video with exact event terms, conditions, and action.
---

## Trigger
Use only when the user explicitly provides a promotion, launch event, live event, discount, benefit, or participation objective.

## Exclude
Do not infer price, discount, dates, stock, urgency, platform mechanics, or legal terms from a generic sales request.

## Inputs
Require verified event identity, value, dates/conditions, participation method, product evidence, project/base revision, and authorization.

## Tool order

### For NEW product promotion video (user provided product info/assets)
1. Call `video_task` with `projectId: null`, `baseRevisionId: null`, `attachmentPaths: [...]`, and promotion video request
2. Service auto-creates project and generates promotion video
3. If queued/running, report the real stage and stop this turn; call `video_job_status` only once when the user explicitly asks for status
4. Call `video_result` only after a real revision exists

### For EDITING existing promotion video
1. Call `video_project_open` to get current `projectId` and `baseRevisionId`
2. Call `video_task` with `projectId`, `baseRevisionId`, and edit request
3. Call `video_job_status` once only when status was requested or the task is terminal; call `video_result` only after a real revision exists

**Key: User provides product assets → NEW project with projectId:null**

## Output
Return exact term-to-text/evidence mapping, native text objects, job/revision, candidate video, and quality state.

## Preserve
Preserve wording, dates, qualifiers, product identity, readable duration, audio constraints, and all unrequested objects.

## Failure
Ask for a missing material term or omit the unsupported offer; never create a plausible-looking promotion.

## Acceptance
Every visible offer and action matches supplied terms and remains readable in the rendered video. Source: `commerce/scenes/product-promotion/`.
