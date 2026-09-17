# G1/G2/G3 final closeout

This index follows the user's September 17, 2026 D1 → D5 request. Historical scene obligations remain historical; no new product/demo scope is introduced.

## Current evidence, not completion

- Baseline `c3b8c74af425c5bc0d2b52d391de98f0bf1e7a2d`; pre-existing dirty files retained.
- D1 fix `ab494f71`: latest Windows job had passed delivery tests and failed the first content fixture. Canonicalizing the fixture ROOT reproduces production semantics; traversal/absolute-path negative cases added. Linux CI passed; Windows workspace/application steps passed, final browser/startup result requires retrieval.
- D2 fix `10fa6221`: relative caption movement freezes previous real caption IDs before planning, routing, application and publication. Semantic caption targets are independently frozen from the message router. Missing/stale/expanded targets fail closed. This does not claim all abstract requests are covered.
- Main workbench discovered at port 3024, `data/result-completion-projects`; no assumption that historical 3020/3041 is current.
- Existing S02 eight-revision MiniMax history imported once through real main WebUI: project `1ae65883-a821-437b-be46-1ea4e7e0eebe`. Original mother `ffa3bcb0-f6b8-4f54-a52a-973c07e1bd3b` preserved.
- The historical 21-revision project and global-media evidence were not found in 165 scanned project states or the retained workspace manifest. Ledger prose alone is not accepted as evidence.
- Run evidence: `outputs/global-media/final-delivery/20260917T0600-closeout/`. First real semantic edit succeeded, then relative single-caption move succeeded. Third edit failed workflow requirement override validation; not counted as a successful turn.
- Main service restart at 06:23 UTC collided with another task's newly submitted S04 job. Shell did not stop after idle assertion failed. Original S04 job/run became recoverable; owner task informed and coordinates resumption. No more shared service restart without coordination.

## Paths and real consumers

| State / scope | Path | Consumer / evidence |
| --- | --- | --- |
| REUSED G1 | config/routing/route-policy.v1.json; fallback-policy.v1.json | global-router → creative message-routing and edit service |
| REUSED G1 | lib/orchestration/global-router.mjs; skill-resolver.mjs; skill-hints.mjs | common routing / selected skill resolution |
| REUSED G1/G3 | config/skills/conversation-edit.md; registry.json | creative model-edit and edit provider load instructions before planning |
| MODIFIED G3 | lib/orchestration/conversation-edit.mjs | creative routing/service; pre-plan scope and post-apply receipt |
| MODIFIED G1/G3 | lib/creative/message-routing.mjs; service.mjs | actual `/api/commerce-chat` dispatch and executor |
| REUSED G2 | lib/orchestration/transition-catalog.mjs; lib/edit/caption-segmentation.mjs | Native/Timeline compile and real speech grouping |
| MODIFIED G3 | scripts/test-caption-scoped-edit.mjs | actual routing + patch + preserved-object negative cases |
| MODIFIED D1 | scripts/test-workspace-content.py | Windows/Linux workflow; 9 restore cases |
| MODIFIED G2/G3 | scripts/verify-global-media-ui.mjs; verify-global-media-output.mjs; verify-global-history-reopen.mjs | existing UI/render/import checkers, configurable data/evidence locations |
| NEW G1/G2/G3 | scripts/verify-final-delivery.mjs | read-only evidence gate + opt-in existing core/browser runners |
| NEW G1/G2/G3 | docs/GLOBAL-CLOSEOUT-FINAL.md | final scope/path index |
| GENERATED | outputs/global-media/final-delivery/<runId>/ | raw logs, hashes, UI events, backups, source and run binding |
| PLANNED DELIVERABLE | deliverables/global-foundation/<releaseId>/ | final MP4/history/README/change map/checksum/evidence; not delivered yet |

## Unified gate

`node scripts/verify-final-delivery.mjs --run-dir outputs/global-media/final-delivery/<runId>` reads `evidence-index.json`, checks current source/config/dependency hashes, raw original receipts, Windows candidate identity, real changed revisions and model request/response files, exact output hash and main-workbench downloads. Missing records fail closed. `--run-checks core,browser` explicitly composes the existing regression runner. It never creates/edit/imports a project, generates media or signs human approval.

Existing historical verifiers remain source evidence; invalid-duration effect tests are not runtime effect failure proof. Mock service fault tests prove execution protection only, not real semantic business success. Actual playback completion proves runtime continuity only, not listening or human approval.

Required states remain separate: implementation_complete; technical_ready; human_review; final_status. Human review is pending until the actual final film is reviewed by a person. Current status remains in_progress/technical_ready=false.
