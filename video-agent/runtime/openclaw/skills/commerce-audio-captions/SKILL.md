---
name: commerce-audio-captions
version: 1.0.0
description: Preserve and edit source audio, voice, music, captions, alignment, and timing through the existing audio workers.
---

## Trigger
Use when the request or affected edit changes voice, source audio, music, caption text/style/timing, transcription, or alignment.

## Exclude
Do not send audio to the structured stage provider, change provider/voice, synthesize speech, remove source audio, or incur cost without explicit authorization.

## Inputs
Require current audio graph/caption objects, exact requested change, source timing, selected authorized voice/provider if any, base revision, keep-set, and authorization.

## Tool order

### For NEW projects with audio/caption work
1. Call `video_task` with `projectId: null`, `baseRevisionId: null`, `attachmentPaths: [...]`, and audio/caption request
2. Service auto-creates project and processes audio
3. If queued/running, report the real stage and stop this turn; call `video_job_status` only once when the user explicitly asks for status
4. Call `video_result` only after a real revision exists

### For EDITING existing project's audio/captions
1. Call `video_project_open` to get current `projectId`, `baseRevisionId`, and validate audio/caption objects
2. Call `video_task` with `projectId`, `baseRevisionId`, explicit changes and keep-set
3. Call `video_job_status` once only when status was requested or the task is terminal; call `video_result` only after a real revision exists
4. Inspect artifacts and review state only after a real revision exists

**Key: User uploads video needing audio work → NEW project with projectId:null**

## Output
Return affected object IDs, provider/cache receipt when used, measured duration/alignment, updated revision, artifacts, and separate listening-review status.

## Preserve
Preserve unmentioned tracks, source-audio association, selected voice, provider, cache, volume, caption independence, and all visual objects.

## Failure
Block an unavailable or unauthorized provider; report unreviewed listening honestly; never estimate alignment from text length or replace a failed call with silence.

## Acceptance
Local contracts pass, the native graph and rendered artifact agree, and real listening remains a separate required gate. Source: `config/skills/audio-mix.md`, `config/skills/speech-captions.md`, and `config/voice_profiles.json`.
