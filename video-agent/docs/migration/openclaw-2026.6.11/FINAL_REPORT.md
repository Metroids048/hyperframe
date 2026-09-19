# Migration progress report

Migration is not complete. OpenClaw 2026.6.11 is now installed permanently on this
Mac and connected to the user's existing CC Switch One-API / gpt-5.6-sol provider.
The original workbench is running an explicit OpenClaw canary; start.py's default
has not been cut over. HyperFrames remains 0.8.33.

The takeover uncovered actual protocol incompatibilities hidden by prior mocks:
missing message.type in both adapters, unsupported stage text.format, incompatible
image_url input, and the Gateway's canonical Agent session prefix missing from
execution authorization. These were fixed and checked against the pinned package.
Remaining creative review/repair/voice and editor provider fallbacks were addressed.

Real stage text and image calls passed. The original WebUI successfully submitted
a title-only edit through commerce-control, commerce-engine, the existing service
and commerce-stage. The resulting native revision changed one title node only;
scenes, other nodes, transitions, audio, captions, assets and output remained equal.

Three-round completion, fresh creation, complete exported-media comparison,
remaining scene/live audio gates, real rollback and final default cutover are still
required. No new paid image/video generation was invoked. Relay currency billing
has not been verified; token usage is recorded where returned.

See LOCAL_USAGE.zh-CN.md for the installed entry points, STATUS.json for the resume
point, and evidence/takeover-real-gateway-2026-09-19.json for current evidence.
