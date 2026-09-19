# Acceptance ledger

Current local status: migration remains blocked for real-provider and end-to-end acceptance. The default entry remains `COMMERCE_AGENT_RUNTIME=legacy`; OpenClaw is not the default route.

Statuses are evidence-based: pass, fail, blocked, or not_run. A passing local facade test is not a real Gateway/plugin or media acceptance.

| Gate | Status | Evidence / limitation |
|---|---|---|
| M0 local baseline and dirty-work protection | pass | BASELINE.md and workspace context |
| exact OpenClaw v2026.6.11 package/tag | pass | isolated registry/tarball evidence and SDK inspection |
| M1 shared single-writer facade | pass | facade contract tests |
| plugin manifest and source contract | pass | plugin contract tests |
| per-tool strict schema and server authorization boundary | pass | real 2026.6.11 SDK registered 11 distinct schemas; every write requires project/base revision/operation/changes/keep/authorization and the facade revalidates them |
| real plugin manifest and registration | pass | isolated OpenClaw v2026.6.11 Gateway health + runtime inspect: commerce-engine loaded/activated, 11 tools, no diagnostics |
| runtime skills and scene preservation | pass | OpenClaw 2026.6.11 discovered 12 allowlisted workspace skills; six scenes, general, edit/variant, HyperFrames, audio/captions, orchestration, recovery; source and skill hashes pass 12/12 |
| control/stage agent config and real CLI validation | pass_local_and_cli_config_only | 14/14 static checks; real `openclaw config validate --json` returned `valid:true`, `warnings:[]`; stage has no write tools and elevated access is disabled |
| stage adapter local contract (schema/cancel/image/receipt) | pass | scripts/test-openclaw-stage-provider.mjs (9/9), including strict boolean/additional-property checks and PNG/JPEG size/order receipts; this is not a real model pass |
| no-credentials safety guard | pass | openclaw-stage-no-credentials-2026-09-19.json; returned OPENCLAW_STAGE_BLOCKED without a network request or Codex fallback |
| stage model structured response (real OpenClaw target) | blocked | Gateway is available in isolation, but no stage model credentials/authorization supplied |
| local bridge authorization | pass | isolated bridge returned 401 for missing bearer and 403 for workspace mismatch |
| real SDK plugin to local bridge (read-only) | pass | OpenClaw 2026.6.11 SDK executed `commerce_resource_search`; no write/model/media/paid side effects |
| stable session and project binding (local) | pass | real SDK factories capture trusted `toolContext.sessionKey`; 6/6 binding tests, hashed persistence, cross-project conflict and missing-session fail closed |
| server-issued execution authorization | pass | local 11/11 control bridge and 8/8 facade tests bind project, base revision, session, tool and operation; missing validator/authorization fails before enqueue |
| token/session log redaction | pass | 6/6 isolated boundary checks; captured server output omitted bridge/control bearer tokens and raw session key |
| original WebUI through OpenClaw | blocked | local protocol harness passed 8/8 from `/api/commerce-chat` through control bridge, tool callback, shared facade and existing job queue; no credentialed real OpenClaw control Agent/browser run |
| audio/subtitle preservation (local contracts) | pass | caption/audio contract suites pass; no real provider or listening review |
| six scenes/general/recut/variant local regression | pass | M6 evidence covers distinct scene/workflow contracts, continuation, history, package, recovery and audio/captions; no real model/media acceptance |
| existing WebUI non-regression | pass | acceptance 20/20 plus editor core/browser checks; real Chrome and HyperFrames render on legacy route, not OpenClaw Agent E2E |
| browser, visual and listening review | blocked | local media contracts pass, but real browser/Computer Use plus visual/audio acceptance are unavailable |
| paid media generation and acceptance | blocked | no paid provider authorization; no paid media/visual/audio call was made |
| three natural-language revision rounds | blocked | real WebUI continuation rounds were not run |
| local provider rollback | pass | openclaw/shadow fail closed without credentials; explicit openclaw-to-legacy routing rehearsal passed without starting a Gateway or media job |
| single-writer process lease | pass | unit fault injection 4/4 plus two-server E2E: second writer rejected, graceful release and same-directory restart passed across legacy/edit/commerce data dirs |
| recovery/idempotency/unknown submission/cancel | pass | facade fault injection 6/6; `submission_unknown` persists and never replays, failed same-key requests cannot return false success, cancel is idempotent and project-bound |
| Gateway-backed job rollback | blocked | only local routing rollback was rehearsed; no real persisted Gateway job was cancelled/resumed |
| default switch and rollback | blocked | default remains legacy; switching OpenClaw on requires the blocked real-provider, browser, media, revision, and Gateway-job gates |

No model, media, browser/Computer Use, or paid-provider call was made for this local evidence update.

## 2026-09-19 local audit

The local OpenClaw facade, plugin contract, stage-provider contract, rollback rehearsal,
commerce router, and JavaScript syntax checks passed. The bridge now preserves known
OpenClaw boundary error codes and HTTP statuses. This audit did not invoke a real stage
model, browser session, media provider, paid generation, or Gateway job.

Evidence: `evidence/local-openclaw-audit-2026-09-19.json`.

Read-only bridge evidence: `evidence/openclaw-plugin-bridge-readonly-e2e-2026-09-19.json`.
This narrows M4 to the real OpenClaw WebUI/browser session; it does not satisfy that
browser gate by itself.

Current control bridge evidence: `evidence/openclaw-control-bridge-local-2026-09-19.json`.
It proves server wiring and authorization against a deterministic Gateway protocol
harness. It is deliberately not counted as a real OpenClaw model pass.

Configuration evidence: `evidence/openclaw-agent-config-2026-09-19.json`.
The security-boundary test now uses an isolated authorization lease path, so it can
run alongside the legacy workbench without touching its writer lock.
