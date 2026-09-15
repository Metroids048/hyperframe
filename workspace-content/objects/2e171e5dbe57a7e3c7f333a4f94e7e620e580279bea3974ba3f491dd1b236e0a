# Codex five-hour-limit replica — HANDOFF

A 10.15 s, 3840×2160 @ 60 fps HyperFrames recreation of an X/Twitter meme clip. Everything on
screen is a DOM/SVG element driven by a paused, seek-safe GSAP timeline, so it opens and edits in
HyperFrames Studio. Read this before touching the project.

## 1. Preview / check / render

```bash
npm run dev        # npx hyperframes@0.8.26 preview  → Studio at http://localhost:3002
npm run check      # lint + runtime + layout gate (passes; 25 contrast warnings are expected, see §5)
npm run render     # 60 fps, high quality → renders/codex-five-hour-limit-replica.mp4 (609 frames, silent)
```

GSAP 3.12.5 loads from jsdelivr — the only network fetch. It is deliberately not vendored: a copy in a
public HeyGen repo would be redistributing GSAP. Pinned CLI: `hyperframes@0.8.26` (the colour
compensation in §4 was measured on this version).

## 2. Layout

```
index.html                 root: mounts 3 sub-compositions + figure video, drives the figure rise (no audio, see §6)
compositions/lockup.html   f0–212  flower → blob morph, wordmark split-flaps, zoom
compositions/chat.html     f211–608 chat box, placeholder/caret/icons, typed text, send, camera pan
compositions/headline.html f453–608 curved headline, per-glyph pop
assets/                    fonts (Inter 400/500/600, Heebo 900 + OFL texts), fig.webm (performer)
tools/gen.py               GENERATOR — writes index.html + compositions/ from tools/tables.json + tools/cal.json
tools/tables.json          every measured table (frame → value) from the source clip
tools/logos/               OpenAI flower path (svgl), traced Codex silhouette (549 pts, 24-unit box)
STORYBOARD.md              beat table with frame ranges
renders/                   local output (git-ignored)
```

Element ids you will meet in Studio: `#flower`, `#blob` (`#blob-s` spring scale, `#blob-k` silhouette
breath, `#glyph` spin, `#chev` blink, `#under`), `#wm-a-*` / `#wm-b-*` / `#wm-c-*` (wordmark glyphs
for ChatGPT / Tibo Please / Codex), `#zoomg` (the dive), `#box` (+ `#placeholder`, `#caret`,
`#icons`, `#mic`, `#send`), `#typed` and `#ty-0…69`, `#hl-0…29` (headline glyphs), `#fig`.

## 3. Two ways to edit — pick one

- **Edit the HTML directly** (Studio or by hand). Then never run `tools/gen.py` again, or your
  edits are overwritten.
- **Edit the tables** (`tools/tables.json`, `tools/cal.json`) and run `npm run generate`. Use this
  when you want to re-measure or re-fit a mechanism; the generator turns frame tables into GSAP
  keyframes (Douglas-Peucker knots: zoom 66, box 100, pan 62, glyph spin 25).

`cal.json` holds the hand-calibrated offsets (figure placement, placeholder/typed/headline nudges).

## 4. Architecture rules (don't break)

- Root `data-duration="10.1475"` = (609 − 0.15) / 60 so the render is exactly 609 frames; keep
  `--fps 60`.
- Every sub-composition file keeps `<style>`, markup and `<script>` inside `<template>`; the root
  is styled by `#root`; the timeline is registered as `window.__timelines["<id>"]` with the id
  matching the host mount.
- All timing is `frame / 60` on paused timelines; no clocks, no randomness, no `tl.play()`.
- Zero-duration `tl.set()` placed later on a timeline renders immediately in GSAP — pass
  `immediateRender: false` (this bit us once: the flower vanished).
- SVG layers use `overflow: visible`; the typed layer extends past 3840 px before the camera pan.
- Colours are pre-compensated for the renderer's shift (−3/−3/−4 saturated, −3/−1/−1 greys);
  `rgb()` in `gen.py` applies it. If you author a colour by hand, add the same offsets.
- Wordmark glyph squashes use `svgOrigin` at (glyph x0, cap top) for exits and (x0, baseline) for
  entries; the static per-glyph fit (`scale(sx sy)`) lives on the inner `<text>`, the animation on
  the outer `<g>`.

## 5. Known gaps and expected check output

- `npm run check` passes with 25 **contrast warnings**: the headline is white on white by design
  and reads through its dark drop shadow, which the contrast checker cannot see. The figure
  covering the typed sentence and the headline glyphs overlapping are intentional and marked with
  `data-layout-allow-occlusion` / `data-layout-allow-overlap`.
- Fidelity vs the pixel-exact canvas build this was ported from: 14-frame MAD 2–10 (0–255 scale).
  Largest residuals are the zoom scale during the dive (<1 %) and the CSS drop-shadow vs the
  canvas multi-layer shadow on the headline.
- The substitute performer's raised arm is lower and closer to the body than the source's; the
  headline sits about 4 px lower on the right end.

## 6. Provenance

- Performer: generated still (Vertex `gemini-2.5-flash-image`) → Veo 3.1 image-to-video → HyperFrames
  `remove-background` → dilated outline + chest lockup → VP9 alpha WebM. No frame of the source
  person is used.
- OpenAI flower: svgl `openai.svg`. Codex blob: silhouette traced from the source at f110, glyph
  authored from measured geometry.
- Fonts: Inter (OFL), Heebo 900 (OFL, Google Fonts). Heebo was chosen by per-glyph IoU fit against
  the source headline (0.891; Rubik 900 scored 0.821).
- Audio: none. The source clip's AAC track is a third party's and is not redistributed; the composition
  and the rendered MP4 are silent. (Internal QC cuts with the reference audio muxed in stay internal.)
- Marks: the OpenAI flower and the Codex mark are third-party marks rendered from vector geometry in
  `compositions/lockup.html` and `tools/logos/`; we do not license them. Publishing is a deliberate call.
