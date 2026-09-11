# Creative v2 gap audit (LOOP 00)

Date: 2026-09-11

## Baseline
- Checkout: `main`, HEAD `a81cda9efbeef018c642ef55ef06cc0c760e1321`, clean, equal to `origin/main`.
- Node `v24.19.0`, Windows x64, HyperFrames `0.8.33`, GSAP `3.14.2`.
- Existing implementation is commerce/edit oriented: `lib/creative/compiler.mjs`, `lib/edit/`, `examples/commerce-quality/`, `showcase/`; no `creative-v2` service tree or four canonical demos.
- Existing acceptance suite passed all reported checks; full process did not return within the initial polling window and is retained as an unresolved baseline run.

## Pinned capability probe
Verified from `npx hyperframes --version`, command help and local docs:
- composition/sub-composition, GSAP, video/audio: available by documented HTML/runtime contract.
- lint, check, validate, preview, render, inspect, keyframes, snapshot: available commands.
- Lottie/shader/Three.js: no dedicated command or adapter surfaced by the pinned CLI; support must be proven through a custom-native composition probe before implementation.
- shot/snapshot diagnostics: `keyframes --shot` and `snapshot --at/--against` are available; there is no `shot` top-level command in this pin.

## Gaps before LOOP 01
1. No unified EvidencePack contract for text/image/video/mixed input.
2. No CreativeBrief → DESIGN.md → STORYBOARD.md compiler contract.
3. No scene router or root/sub-composition project model for creative-v2.
4. Existing commerce compiler remains a monolithic path and must be preserved while new services are added.
5. No official-pattern reference document or evidence-backed state ledger existed before this loop.

No business behavior was changed in LOOP 00.
