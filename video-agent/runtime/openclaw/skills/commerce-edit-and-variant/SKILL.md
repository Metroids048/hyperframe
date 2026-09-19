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
Call `commerce_project_get`, resolve real objects and history, validate with `commerce_plan_validate`, submit `commerce_edit_video` or `commerce_revision_control`, then read the job/project and list artifacts.

## Output
Report the resulting revision and object-level change receipt, with before/after IDs and preserved objects. A variant retains an explicit mother revision.

## Preserve
Preserve every unmentioned object, source interval, caption, audio relation, fact, quality decision, and sibling revision.

## Failure
Clarify an unknown or ambiguous target. Reject stale revisions and conflicting keep/change sets. An uncertain submission is not replayed.

## Acceptance
Three-round acceptance requires: caption-only change; target-transition-only change; selective transition restore while retaining the latest caption and all other objects. Source policy: `config/skills/conversation-edit.md` and the current native project.
