---
name: commerce-hyperframes
version: 1.0.0
description: Bind relevant HyperFrames 0.8.33 resources to executable native video work without loading the full catalog into context.
---

## Trigger
Use when a validated plan needs an available composition, component, transition, caption, typography, effect, or shader.

## Exclude
Do not install or upgrade HyperFrames, claim a discovered name was used, inject unrestricted HTML/JS, or select a resource without runtime binding.

## Inputs
Require shot purpose, media kind, aspect, safe area, motion/audio dependencies, project/base revision, and exact local resource query.

## Tool order
Call `commerce_resource_search`; distinguish local media from executable HyperFrames resources; choose only compatible resources with `executionStatus` and `bindingStatus`; include catalog/composition/runtime identifiers in `commerce_plan_validate`; submit the bounded job; verify the job and artifact receipts.

## Output
Return selected resource IDs, versions, runtime bindings, affected objects, job/revision, compiled native project, and render evidence.

## Preserve
Keep HyperFrames pinned to 0.8.33, source media/facts, object editability, safe areas, audio timing, and unselected objects.

## Failure
Treat discovery without runtime binding, compile failure, blank render, or missing receipt as failure; choose no resource rather than inventing one.

## Acceptance
The actual project receipt proves the selected resource executed in the correct object/shot and the rendered pixels are nonblank. Source: `config/hyperframes/` and `config/skills/hyperframes*.md`.
