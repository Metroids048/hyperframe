# Commerce Promo Native Creation

Use this workflow when the user asks to turn product images or product footage into a polished product-promo video.

## Contract

- The native HyperFrames project is the source of truth. MP4 is an export, not the only editable artifact.
- Use only product claims, prices and promotions explicitly supplied by the user or marked as verified in project facts.
- Prefer verified effect components for common motion. If a requested visual cannot be represented by the component library, create an isolated scene composition rather than silently dropping the effect.
- A local edit must preserve unrelated nodes, media, audio and copy.
- Adding or changing on-screen text never implies narration.

## Execution surface

The current host-agent execution surface is:

```bash
node scripts/commerce-agent-tool.mjs
```

It accepts one JSON request on stdin and returns one JSON result on stdout. For a human-readable example:

```bash
npm run commerce:build
npm run commerce:render
```

The core document, components and compiler live under `lib/creative/`.

## Required flow

1. Normalize and validate assets and product facts.
2. Create a ProductBrief and DesignSpec before animation.
3. Solve scene duration including transition overlap.
4. Generate a NativeDocument v3 with stable object IDs.
5. Compile the document to deterministic HyperFrames HTML.
6. Run HyperFrames check before final render.
7. Keep `document.json`, `object-map.json`, `manifest.json` and `DESIGN.md` with the result.
8. When changing an existing project, patch object IDs instead of rewriting unrelated scenes.

## Initial effect set

`product-reveal`, `image-pan-zoom`, `detail-inset`, `layered-parallax`, `title-reveal`, `keyword-emphasis`, `feature-callout`, `split-detail`, `price-lockup`, `end-card`, `dissolve-transition`, `directional-transition`.

`layered-parallax` requires actual layerable source material. Do not claim true parallax when the required assets do not exist.
