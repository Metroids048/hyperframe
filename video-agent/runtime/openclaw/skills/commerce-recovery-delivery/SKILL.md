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
Read `commerce_project_get` and `commerce_job_get`; use `commerce_job_control` only for explicit cancel/resume; use `commerce_revision_control` for history; call `commerce_export` only after gates; finish with `commerce_artifact_list`.

## Output
Return persisted checkpoint, provider/submission state, resumability, revision, artifact hashes, candidate/final status, and remaining gates.

## Preserve
Keep legal revisions created before and after migration, original assets, native project data, history, and unknown-charge records.

## Failure
Expose failed, recoverable, awaiting-review, and submission-unknown separately. Stop rather than resubmit when provider acceptance cannot be determined.

## Acceptance
Reconnect reads the same job without duplicate submission; cancel blocks late publication; rollback changes routing without losing new revisions. Source policy: `config/routing/fallback-policy.v1.json` and `config/quality/acceptance.v1.json`.
