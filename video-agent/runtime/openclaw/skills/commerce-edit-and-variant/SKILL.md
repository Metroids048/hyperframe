---
name: commerce-edit-and-variant
version: 1.0.0
description: Perform object-level edits, recuts, variants, undo, redo, and restore while preserving the base revision and keep-set.
---

## Trigger
Use for object edits, recut, variant, undo, redo, or selective restore on an existing native project.

## Exclude
Do not reinterpret a local edit as a new business scene, modify sibling variants, replace the mother project, or use chat history in place of current object IDs.

## Inputs
Require projectId, current baseRevisionId, exact target IDs, requested changes, keep-set, operationId, and write authorization.

## Tool order

### For NEW projects (user uploaded video for editing)
1. Call `video_task` with `projectId: null`, `baseRevisionId: null`, `attachmentPaths: [...]`, and edit request
2. Service auto-creates project and applies edits
3. If queued/running, report the real stage and stop this turn; call `video_job_status` only once when the user explicitly asks for status
4. Call `video_result` only after a real revision exists

### For EDITING existing project (object-level edits, recuts, variants, undo/redo)
1. Call `video_project_open` to get current `projectId`, `baseRevisionId`, and resolve real objects/history
2. Call `video_task` with `projectId`, `baseRevisionId`, target IDs, requested changes, and keep-set
3. Call `video_job_status` once only when status was requested or the task is terminal; call `video_result` only after a real revision exists
4. Inspect the resulting revision and change receipt only after a real revision exists

**Key: User uploads video needing edits → NEW project with projectId:null**

## Output
Report the resulting revision and object-level change receipt, with before/after IDs and preserved objects. A variant retains an explicit mother revision.

## Preserve
Preserve every unmentioned object, source interval, caption, audio relation, fact, quality decision, and sibling revision.

## Failure
Clarify an unknown or ambiguous target. Reject stale revisions and conflicting keep/change sets. An uncertain submission is not replayed.

## Acceptance
Three-round acceptance requires: caption-only change; target-transition-only change; selective transition restore while retaining the latest caption and all other objects. Source policy: `config/skills/conversation-edit.md` and the current native project.
