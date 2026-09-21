---
name: commerce-recovery-delivery
version: 1.0.0
description: Report real jobs, checkpoints, artifacts, quality gates, and delivery status; recover without duplicate charging.
---

## Trigger
Use for status, reconnect, cancel, resume, recovery, artifact listing, export, and delivery questions.

## Exclude
Do not treat browser disconnect as cancellation, restore a data-directory snapshot over new work, or replay a provider submission whose charge state is unknown.

## Inputs
Require trusted project/session, jobId or revisionId, current base revision for writes, operationId, keep-set, requested control change, and authorization.

## Tool order

### For checking status of existing projects/jobs
1. Call `video_project_open` to read project state and bind projectId/baseRevisionId
2. Call `video_job_status` to check current job state and provider/submission status
3. (Optional) Call `video_cancel` only for explicit user cancel/resume requests
4. (Optional) Call `commerce_revision_control` for history queries
5. (Optional) Call `commerce_export` only after quality gates have passed
6. Call `video_result` to list persisted checkpoints, artifacts, and delivery state

### For NEW projects (delivery/export requests for uploaded content)
1. Call `video_task` with `projectId: null`, `baseRevisionId: null`, `attachmentPaths: [...]`, and export request
2. Service auto-creates project and processes content
3. If queued/running, report the real stage and stop this turn; call `video_job_status` only once when the user explicitly asks for status
4. Call `video_result` only after a real revision exists

**Key: Status/recovery uses video_project_open first; new uploads use projectId:null**

## Output
Return persisted checkpoint, provider/submission state, resumability, revision, artifact hashes, candidate/final status, and remaining gates.

## Preserve
Keep legal revisions created before and after migration, original assets, native project data, history, and unknown-charge records.

## Failure
Expose failed, recoverable, awaiting-review, and submission-unknown separately. Stop rather than resubmit when provider acceptance cannot be determined.

## Acceptance
Reconnect reads the same job without duplicate submission; cancel blocks late publication; rollback changes routing without losing new revisions. Source policy: `config/routing/fallback-policy.v1.json` and `config/quality/acceptance.v1.json`.
