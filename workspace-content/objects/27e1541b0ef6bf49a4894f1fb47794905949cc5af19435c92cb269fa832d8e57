# Codex five-hour-limit replica — Storyboard

1:1 recreation of a 10.15 s X/Twitter clip (3840×2160 @ 60 fps, 609 frames). Silent by design: the source clip's audio is a third party's track and is not part of this project.
Source: https://x.com/xingbugengming/status/2094728698444587038

Every beat below was measured frame-by-frame on the source clip (`tools/tables.json`), then
authored as DOM/SVG elements with GSAP keyframes so it plays in HyperFrames Studio. Times are
`frame / 60`. The clip is one continuous shot; there are no hard cuts.

**Format:** 3840×2160 landscape, 60 fps, white ground `#fff`. Fonts: Inter 400/600 (UI and
wordmark), Heebo 900 (headline, Roboto-Black shapes at 0.85 horizontal scale).

**Performer:** the source shows an identifiable person. That likeness is **not** reproduced. The
protester is a substitute performer (generated still → Veo image-to-video → alpha WebM,
`assets/fig.webm`) in the same staging: black ChatGPT Plus tee, megaphone, raised fist.

---

## Beats

| # | Frames | Time | Composition | Beat | Motion |
|---|--------|------|-------------|------|--------|
| 1 | 0–14 | 0.00–0.23 | `lockup` | ChatGPT lockup (OpenAI flower + "ChatGPT") arrives | Whole lockup scales 0.92→1 about its anchor while fading 0.6→1 |
| 2 | 15–37 | 0.25–0.62 | `lockup` | Split-flap: "ChatGPT" → "Tibo Please" | Each old glyph squashes to its cap line over 5 f; each new glyph grows from the baseline over 11 f (purple), per-slot staggered |
| 3 | 39–62 | 0.65–1.03 | `lockup` | Flower spins away | Flower rotates clockwise 0→173° with accelerating rate, shrinks to 0.85, fades f57–62 |
| 4 | 57–100 | 0.95–1.67 | `lockup` | Codex blob springs in | Blob fades in f57–63; scale 0.72 → 1.078 overshoot → settles at 1.0 |
| 5 | 54–75 | 0.90–1.25 | `lockup` | Split-flap: "Tibo Please" → "Codex" | Same exit/enter squash; new glyphs enter purple and settle to black over 6 f |
| 6 | 61–108 | 1.02–1.80 | `lockup` | `>_` glyph spins into place | Rotation −188° → 0° about the blob centre, exponential settle |
| 7 | 112–125 | 1.87–2.08 | `lockup` | Blink | The chevron squashes to a dash (f118 fully closed) and reopens |
| 8 | 145–211 | 2.42–3.52 | `lockup` | Dive into the blob | Zoom 1× → 61× about the `_` glyph centre, per-frame (scale, anchor) table; blob silhouette breathes f165–175; blue fades to white f209–212 |
| 9 | 211–258 | 3.52–4.30 | `chat` | Chat box lands | Box scales 2.5× → 1× while translating into place; border fades in over 4 f |
| 10 | 233–252 | 3.88–4.20 | `chat` | Empty state | "Ask Codex anything" placeholder and purple caret fade in; + and slider icons fade in f236–256 |
| 11 | 252–379 | 4.20–6.32 | `chat` | Typing | 70 glyphs drop in with a 17-frame spring, purple → black after 8 f; camera pans left 3788 px following the caret; box scrolls 150 px relative to the text |
| 12 | 393–410 | 6.55–6.83 | `chat` | Send | Dark send disc + white arrow crossfade to a bare dark arrow, 3 % pulse |
| 13 | 407–437 | 6.78–7.28 | root `#fig` | Protester rises | Alpha WebM translates up 949 px on a decelerating curve, fades in f407–412 |
| 14 | 453–~540 | 7.55–9.00 | `headline` | "End the five hour limit now!!!" | Glyphs on a cubic arc with tangent rotation (±16°); each glyph appears as a small grey ghost, overshoots to 1.45× lifted with extra lean, settles; onset linear in x (≈2.8 f per glyph) |
| 15 | 540–608 | 9.00–10.13 | all | Hold | Final lockup holds to the end |

---

## Layout facts (screen px at 3840×2160)

- Lockup anchor (1882, 1335); flower bbox 1312,849–1771,1314; blob bbox 1269,807–1814,1356.
- Wordmark: Inter 600 at 224 px, cap top 1029, baseline 1191; each glyph fitted to its measured ink box.
- Zoom origin (the `_` glyph centre): (1613, 1156.5).
- Chat box final geometry: left 278 (content space), top 548, 6837×1148, radius 130, border 15 px `rgb(204,201,210)`.
- Typed text: Inter 400 at 148.5 px, baseline 1001, starts at content x 663.
- Headline: Heebo 900 at 268 px, 0.85 horizontal scale, curve `y = 9.44e-9x³ + 5.62e-5x² − 0.3064x + 676.1 − 11`, span E-centre → last-! centre 2850 px along the arc.
- Figure: `translate(1218, 217) scale(1.2)` on a 1080×1920 alpha WebM.

## Colour compensation

The HyperFrames pipeline shifts colours by about −3/−3/−4 (saturated) and −3/−1/−1 (greys) on
this version. Authored colours are pre-compensated by those amounts (see `rgb()` in `tools/gen.py`).
