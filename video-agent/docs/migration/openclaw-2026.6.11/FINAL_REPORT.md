# Migration progress report

The requested OpenClaw WebUI edit/export loop is complete. OpenClaw 2026.6.11 is
installed permanently on this Mac and connected to the user's existing CC Switch
One-API provider; the effective control/stage model is now gpt-5.5 after
gpt-5.6-sol and gpt-5.6-terra showed intermittent upstream failures.
The original workbench is running an explicit OpenClaw canary; start.py's default
has not been cut over. HyperFrames remains 0.8.33.

The takeover uncovered actual protocol incompatibilities hidden by prior mocks:
missing message.type in both adapters, unsupported stage text.format, incompatible
image_url input, and the Gateway's canonical Agent session prefix missing from
execution authorization. These were fixed and checked against the pinned package.
Remaining creative review/repair/voice and editor provider fallbacks were addressed.

Real stage text and image calls passed. The native OpenClaw Control UI completed a real conversation edit in project
`c630dd26-1a36-4387-a48b-a4f61a945375`. The resulting revision
`rev-3fed8dfd1dcc3abe` changed the first-scene title to “沉浸式聆听”; scenes, other
nodes, transitions, audio, captions, assets and output remained equal. The export
job completed and produced `commerce-final.mp4` (1920×1080, 120 seconds, 5.6 MB).
The playback/download endpoint returned HTTP 200 and the complete MP4 decoded with
ffmpeg without errors.

The U0 launcher gate now rejects health-only or wrong-workspace services, and the
control agent allowlist includes `commerce_project_list`. Native write tools no
longer ask the model for an internal authorization id: the trusted plugin call is
bound to the OpenClaw session/project and the server mints a scoped, short-lived
authorization before the existing execution checks run. Native Control UI `MediaPath`
attachments are now imported only from OpenClaw’s inbound media directory after that
authorization is bound. These changes are locally verified; authorization protection
and the legacy default remain intact.

The Talk button remains blocked because `talk.catalog` reports no configured
OpenAI/Google realtime provider, so it still needs a real provider credential if
voice is required. No new paid image/video generation was invoked. The legacy
default remains preserved until a separate cutover decision.

See LOCAL_USAGE.zh-CN.md for the installed entry points, STATUS.json for the
completed WebUI acceptance, and evidence/u0-u4-native-auth-2026-09-19.json for the
full receipt.
