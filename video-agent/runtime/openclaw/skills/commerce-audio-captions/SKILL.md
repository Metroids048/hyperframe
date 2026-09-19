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
Read project; validate target audio/caption objects and independent timing; submit `commerce_edit_video` with explicit changes/keep-set; poll the real job and inspect artifacts/review state.

## Output
Return affected object IDs, provider/cache receipt when used, measured duration/alignment, updated revision, artifacts, and separate listening-review status.

## Preserve
Preserve unmentioned tracks, source-audio association, selected voice, provider, cache, volume, caption independence, and all visual objects.

## Failure
Block an unavailable or unauthorized provider; report unreviewed listening honestly; never estimate alignment from text length or replace a failed call with silence.

## Acceptance
Local contracts pass, the native graph and rendered artifact agree, and real listening remains a separate required gate. Source: `config/skills/audio-mix.md`, `config/skills/speech-captions.md`, and `config/voice_profiles.json`.
