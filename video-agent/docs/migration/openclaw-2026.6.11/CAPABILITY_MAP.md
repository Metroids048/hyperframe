# Capability and ownership map

| Capability | Existing authority | OpenClaw migration boundary |
|---|---|---|
| conversation and agent run | OpenClaw control bridge implemented; real control Agent still uncredentialed | server-owned stable session, operator token, result contract and journal reconciliation |
| project/revision/jobs/assets | createCreativeService | commerce-engine-facade.mjs; no second service instance |
| exact routing, target validation, keep-set | existing orchestration and service | remains mandatory enforcement layer |
| HyperFrames native document/render | existing production runner, HyperFrames 0.8.33 | facade only enqueues controlled jobs |
| audio, captions, ASR/TTS | existing audio/caption modules and policy | no provider replacement in M1 |
| delivery gate | existing delivery routes | chat result cannot override it |
| session/authorization/operation journal | migration namespace | hashed session mapping plus server-issued write authorization and operation receipt under data/openclaw-bridge |

The facade remains a thin adapter over the existing service. In production server wiring, every write fails closed unless a server-issued authorization is bound to the project, revision, session, tool, and stable operation ID.


## Provider split invariant

`OpenClawStageProvider` handles only structured commerce-stage planning/review. ASR, TTS, speech alignment, and local audio workers remain owned by the existing audio provider so OpenClaw mode cannot silently remove sound or subtitle capabilities.
