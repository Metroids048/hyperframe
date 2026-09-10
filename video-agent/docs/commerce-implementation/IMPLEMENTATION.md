# Commerce native creation — implementation state

Baseline: GitHub `main` at `d2d21bbbbdee7d948ff18ae9ec10fbf41bb5294a` before this change.

## Implemented in this slice

- NativeDocument v3 core model with stable scene/node IDs, explicit anchors and transition-overlap timing.
- Product brief and three design strategies: premium, functional and promotion.
- Twelve registered deterministic effect primitives.
- Native image/video HTML compilation instead of converting images to MP4.
- Object map for later conversation-level edits.
- Structured document patching for text, effect parameters, asset replacement, scene duration, scene reorder, transitions and output size.
- Safe relative-path request contract and image preparation with Sharp input-pixel limits.
- Host-agent/CLI runner that writes `document.json`, `object-map.json`, `manifest.json`, `DESIGN.md`, `index.html` and optional MP4 render.
- A sample product-image request using existing repository sample images.
- Unit tests and GitHub Actions verification for the native pipeline.

## Deliberately not claimed complete yet

- Existing `/api/edit-projects` chat service does not yet dispatch NativeDocument v3 operations; this slice gives the host agent a real executable tool without rewriting the existing workbench.
- The current commerce runner does not auto-transcribe, generate speech, generate media, or infer product claims.
- Video-source audio is not automatically inserted into the commerce document; existing editing/audio subsystems remain the source for that behavior until the bridge loop is completed.
- Custom model-generated scene source bundles are not enabled yet; only reviewed project effects execute in this slice.
- A polished reference MP4 and independent 85-point blind review still require real render/visual review evidence.

## Next integration loop

1. Add image assets to the existing project service without routing them through video probing.
2. Store NativeDocument v3 revisions beside v2 revisions and adapt existing history/export packaging.
3. Add `commerce-promo` to the application skill registry and route product-promo messages to the native document planner.
4. Bridge existing trim/caption/audio operations to native media nodes.
5. Add preview visual inspection and custom composition sandboxing.
6. Run the fixed product sample on the target Windows machine, inspect the full video, then extract/adjust components from visual evidence.

A code path is only `VERIFIED` after its current tests and real rendering/check evidence pass. This file does not claim the 85-point target has been achieved.
