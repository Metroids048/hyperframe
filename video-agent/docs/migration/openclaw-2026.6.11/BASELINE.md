# OpenClaw v2026.6.11 migration baseline

Generated from the current local checkout on 2026-09-19. Local files are the execution source; no dirty file was discarded.

- branch: codex/webui-agent-workflow
- HEAD: 218aa259552cef8e25f25afdb0609aacc3ea3a1e
- origin/main reference: 9283f550f6e639ecf20b7ca9635f39c887219ce9
- workspace: dirty; pre-existing tracked and untracked edits were preserved
- runtime: Node v24.19.0 from the explicitly located bundled runtime (`/Users/a1234/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`); `node` and `npm` remain absent from the task shell PATH; HyperFrames 0.8.33
- initial state: an active legacy server was observed and no OpenClaw Gateway was active; later isolated migration checks installed and ran the exact target without changing the project default
- existing data authority: data/commerce-runs and the existing createCreativeService instance
- baseline checks (bundled Node): workspace-context, test-workspace-context, and test-commerce-router-v2 passed; command log: `outputs/migration/openclaw-2026.6.11/m0-command-log.txt`
- exact OpenClaw package, Gateway, plugin, skills, and installed plugin shape were subsequently verified in isolation; see VERSION_COMPATIBILITY.md and evidence/openclaw-gateway-factory-reload-2026-09-19.json
- external/paid model, browser, audio, visual and rollback acceptance: not run in M0; no paid request was submitted

The pre-existing dirty files remain user-owned.
