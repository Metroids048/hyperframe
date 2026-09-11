# HyperFrames commerce creation core

This repository contains an executable native product-promo pipeline under `lib/creative/`.

## Build a native editable project

```bash
npm run commerce:build
```

The example reads existing repository images from `examples/commerce/request.sample.json` and writes the native project to `data/commerce-runs/coffee-demo/`.

## Render it

```bash
npm run commerce:render
```

The runner performs a HyperFrames check before render and preserves the source document next to the MP4.

## Use it from an agent

Pass the same JSON request through stdin:

```bash
node scripts/commerce-agent-tool.mjs < examples/commerce/request.sample.json
```

An agent can change the request or use `lib/creative/patch.mjs` against stable object IDs. The pipeline does not invent price, benefits or performance claims when they are absent from the request.

See `docs/commerce-implementation/IMPLEMENTATION.md` for the verified scope and remaining bridge work.
