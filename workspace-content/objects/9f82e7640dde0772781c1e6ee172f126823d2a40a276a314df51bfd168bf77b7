# Send to HyperFrames — launch film (public build)

Square 1080×1080, 24fps, 49.28s, silent. A HyperFrames composition: plain HTML + GSAP, one
master timeline in `index.html` mounting five sub-compositions from `compositions/`.

```
npx hyperframes@latest check --no-contrast     # the gate
npx hyperframes@latest preview                 # studio
npx hyperframes@latest render --fps 24 --quality high
```

## What differs from the internal build

This is a redistributable fork of `send-to-hyperframes-launch`. **The two licensed liquid
background plates are not shipped** and the film was adapted so it does not need them:

| scene | internal | here |
|---|---|---|
| S3, the wall of sessions | `assets/s3-liquid.mp4` behind the grid | `#ground`'s original paper radial, restored |
| S4, the world flip | `assets/hf-brand-bg.mp4` | a pure CSS gradient on `#s4 .brandbg` |

The S4 replacement is **deliberately dark rather than green**. On the green liquid plate the
word the scene is built to land — "completes", in `#38D878` — measured only **2.19:1** against
its own ground and **1.77:1** against the cream line beside it, so it stopped reading as an
accent at all. On this gradient it measures **4.0–7.0:1** depending on the beat, and the cream
type 7.1–12.3:1.

Nothing else changed: no timings, no choreography, no seams. `renders/`, `design-pass/` and
`variants/` are not included; a small proof snapshot set is included for visual verification.

## Before this goes public — unresolved licensing

The liquid plates were the asked-for removal, but they are not the only third-party material:

- **`assets/fonts/refsans-medium.ttf` is Helvetica Neue**, self-hosted under the name "RefSans".
  Commercial licence; redistributing the binary in a public repo is almost certainly not covered.
- **`assets/fonts/GalaxieCopernicus-Book.woff2`** — Galaxie Copernicus, commercial licence.
- **`assets/fonts/ABCSolarDisplay-Bold.woff2`** — ABC Solar Display, commercial licence.
- **`Claude_AI_symbol.svg`** is Anthropic's mark and `ORB.svg` is HeyGen's; both are trademarks
  rather than licence problems, but a public repo redistributes them.
- **`assets/navy-bg.mp4`** and its stills were supplied for this project; provenance unverified.

The sibling precedent (`heygen-bouncy-ui-launch`) solved the font half by shipping **Inter** and
scrubbing provenance. Doing the same here means re-fitting the type: every measured value in
this film is tied to these faces — the thesis is 68px because Copernicus is that wide, and the
prompt copy's line breaks come from RefSans's own advance widths. **Swapping fonts re-opens
those fits and the S2→S3 wordmark match cut.** Not attempted; flagged for a decision.
