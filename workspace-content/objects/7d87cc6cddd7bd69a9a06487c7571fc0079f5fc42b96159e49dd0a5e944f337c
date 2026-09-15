# HeyGen — bouncy UI launch

A 12-second square launch film built entirely in one HTML file. A prompt is typed and
generated, and the result arrives as UI: a notification card that gets flipped over, a
chat thread, and a closing text selection.

No video, no image sequences, no After Effects. Every pixel is DOM + SVG driven by a
single paused GSAP timeline, so it renders deterministically at any resolution.

Run `npm run render` to produce `renders/*.mp4` (12.13s · 1080×1080 · 30fps).

```
1080 × 1080 · 12.133 s · 30 fps · silent
```

**Using this as a template?** Download the folder, open it with your coding agent, and
say *"turn this into a video for Figma."* Everything the agent needs is in the next
section — you shouldn't have to explain any of it yourself.

---

## If you were handed this and asked to re-brand it

**You are reading this because someone downloaded this project and said something like
"turn this into a video for Figma."** That is the whole brief you are going to get.
Here is what they expect.

The motion in this file took a long time to tune. **It is not yours to improve.** Your job
is to replace the brand layer — copy, colour, marks, type, icons, and the story the beats
tell — while every frame number, ease, and stamped track stays exactly as it is. If you
rewrite the animation you have failed the task even if your version looks fine on its own,
because the point of handing you this project was the motion.

### 1. Capture the brand instead of guessing it

Don't invent a palette from memory or draw a logo from description:

```bash
npx hyperframes@latest capture https://<their-site> --json
```

That writes a `./capture/` directory with their real logo SVGs, screenshots, colour values
and font references. Pull marks, palette and type from it. Two things to watch:

- Run the real path bbox before you place any SVG — supplied art is frequently not centred
  in its own viewBox, and a hand-guessed `viewBox` clips glyphs silently.
- Register any font under a private family name. The renderer silently aliases real system
  font names and hands you a substituted face with no error.

If there is no site to capture, ask for a logo and two or three hex values. That is enough.

### 2. Write their story into the beats

The beat map below is a set of **slots**, not fixed screens. Fill them with surfaces that
product actually has:

| beat | what it is | what to put there |
|---|---|---|
| the prompt | an input being typed and submitted | how someone asks their product for something |
| the generate | work happening | their loading / processing state |
| the card flip | a result arriving, then turned over | their primary output object, front and back |
| the thread | a short exchange | their real message / comment / review UI |
| the close | a selection on a closing line | their tagline, selected like text |

Use their actual product language. A design tool has files and frames; a music app has
playlists; a payments app has balances. Getting this right is most of what makes the result
feel like their video instead of a recolour.

### 3. Change these, freely

Copy strings, palette values, the marks in `assets/`, the `@font-face` block, icon path
data (keep the viewBox and stroke style), and surface treatment — filled vs outlined, light
vs dark, radii, card internals.

### 4. Never change these

- Any frame number, any `duration`, any clip `data-start` / `data-duration`.
- The easing functions and every `ease:` that points at them.
- Any stamped per-frame array. New *values* are usually fine; a different **count** of
  entries is not.
- Spring constants, and the scene-wrapper `x` / `y` / `scale` / `filter` tweens.

### 5. Re-measure anything that depends on rendered text

Nothing here measures text at runtime, on purpose: doing that in a browser races font
loading and returns fallback metrics. So if you relabel anything whose geometry is derived
from its own width, render once, measure off the frame, and paste the number back.

### 6. Gates before you hand it back

```bash
npm run check     # must pass
npm run render
```

Then look at the render. Check that nothing sits still at a cut, that every beat still lands
where you meant it to, and that the endcard reads.

### Traps that have each cost a round

- **`ease: "expo.out"` is not the same curve as a hand-written `1 - 2^(-10p)`.** GSAP's
  built-ins of that name are a different polynomial. If a file passes ease *functions*,
  leave them as functions.
- **Clip boundaries must sit just *below* their frame time** (`1.166`, never `1.1667`), or
  the outgoing scene owns one extra frame at every cut.
- **Going dark needs a second text layer.** Light type disappears on a coloured highlight,
  so a dark theme needs a near-black copy clipped to the highlight rect.
- **An icon-only button needs a bigger entry multiple** than a wide labelled one, or a cut
  from a full-frame scene into it reads as a drop in visual mass.
- **Don't add idle motion.** Nothing in this film floats, breathes, or pulses to fill time.
  If a beat feels empty, the fix is more information, not more wobble.

---

## Run it

```bash
npx hyperframes@latest preview
```

```bash
npx hyperframes@latest render -o renders/out.mp4
```

`check` runs the linter, a runtime pass, a layout pass and a contrast pass:

```bash
npx hyperframes@latest check
```

## What's interesting about it

The thing worth stealing here is not the layout — it's that **the whole film runs on one
motion law**, stated once at the top of `index.html` and reused everywhere.

### One spring, three channels

A damped spring with **ζ = 1/3**, applied to three channels of the same body at three
different frequencies:

| channel | frequency |
|---|---|
| position | 1.45 Hz |
| shape (squash/stretch) | 1.88 Hz |
| rotation | 2.50 Hz |

Lighter channel, faster ring. That is the entire "bouncy" quality — one `spring()`
function called three times, not three hand-tuned eases:

```js
function spring(u, A, f, zeta) {
  const z  = zeta === undefined ? 1 / 3 : zeta;
  const wd = 2 * Math.PI * f * Math.sqrt(1 - z * z);
  return A * Math.exp(-2 * Math.PI * z * f * u) * Math.cos(wd * u);
}
```

Everything that *doesn't* bounce — reflows, growths, entries — uses a plain exponential
relaxation with **τ = 0.131 s**. Nothing is linear and nothing eases *in*.

### Motion blur for free

Because every position is a pure function of `t`, you can differentiate it and get
velocity without authoring anything:

```js
const D1 = (fn, t) => (fn(t + 0.5 / FPS) - fn(t - 0.5 / FPS)) * FPS;
// sigma = |v| / (fps * shutter * sqrt(12))   -> |v| / 200 for a 180° shutter at 30fps
```

That feeds a per-element SVG `feGaussianBlur`. Roughly half of what reads as "fluid"
costs zero keyframes. Use anisotropic SVG blur rather than CSS `filter: blur()` — CSS
blur is isotropic and reads wrong on a horizontal exit.

One catch worth knowing: derived blur faithfully reproduces any kink in the path. A
piecewise waypoint path is only C0, so the derivative spikes at every waypoint and smears
whatever is supposed to be sitting still. Park *through* a boundary.

### Two motions that are deliberately not eases

The CTA button and the escaping dot both carry **stamped per-frame tracks** instead of
analytic curves, because a launch followed by an impact and a rebound has no clean closed
form. The dot's profile is the interesting one — it *accelerates* at ~4700 px/s² to a peak
of −1011 px/s, slams to a stop against the avatar in four frames, and rebounds at
+196 px/s (restitution ≈ 0.19). Build that as an exponential approach and it reads slow and
soft, because a relaxation decelerates *into a target* where this accelerates *into a wall*.

### Everything has a lineage

Nothing appears from nowhere. When the card is clicked it doesn't leave — it deflates and is
disassembled into its own contents: its avatar becomes the chat avatar, and its unread dot
escapes, flies left, bounces, washes from cyan to white and stretches into the typing
bubble. One body, three costumes. That continuity is most of why the piece reads as one
continuous thing rather than a stack of slides.

## Seek-safety — the one hard rule

`paint(t)` is a **pure function of timeline time**. No state accumulates between frames.

This is a requirement, not a style. The renderer seeks frames out of order across parallel
workers, so anything that depends on "the previous frame" renders differently on every
machine. In practice:

- Derive every value from `t`. Never `+=`.
- No `requestAnimationFrame`, no CSS `@keyframes`, no CSS transitions.
- Never measure the DOM inside the timeline callback (see `tools/fit-type.py`).

## Making it yours

### The copy

All of it is in `index.html`, near the top of the script — `bandA`, the `pill` label,
`posted`, `CARD_A`, `CARD_B`, `WORDS`, `msg1`, `line2`, and the two tags.

Boxes **hug their labels**, so changing copy changes widths. After editing:

```bash
python3 tools/fit-type.py
```

It prints the constants to paste back and flags anything that no longer fits. The CTA is
the one to watch: its width feeds `PILL_K`, which scales only the *width* column of the
stamped track — the spring, rotation and squash dynamics are untouched, so the bounce
survives any label.

### The colour

Every value is a CSS constant in the `<style>` block:

| token | value | role |
|---|---|---|
| ground | `#FBFAF9` | page |
| accent | `#00C3FF` | CTA fill, selection, the dot |
| on-accent | `#171717` | **dark text on cyan — never white** |
| ink | `#171717` | body copy |
| secondary | `#99A1AF` | timestamps |
| surface | `#FFFFFF` | cards, bubbles |
| selection | `#C4EEFA` | accent at 22% over the ground |

Radii follow the design system: `12px` controls (scaled to `14px` at this button size),
`33px` feature panels, `40px` chips.

### The type

Ships with **Inter** (SIL Open Font License) in `assets/fonts/`, declared explicitly.

Don't name a system font here. The renderer substitutes bundled faces for `Helvetica Neue`,
`Arial` and friends, so your browser preview and your render disagree — and every baked text
width silently becomes wrong. Name the face you actually want.

To use HeyGen's brand faces, drop `TTNormsPro-{Regular,Medium,Bold}` and
`ABCSolarDisplay-Bold` into `assets/fonts/`, uncomment the second `@font-face` block, point
`#root` at `"TT Norms Pro"`, set `DISPLAY_FONT` to `"ABC Solar Display"`, then re-run
`tools/fit-type.py`.

> Two axes, not one. If you swap in a face whose cap-height-to-advance ratio differs from
> Inter's, fitting size on width alone lands the width and leaves the glyphs short — which
> reads as *"the type is too light"* even though the weight is correct. Set the size from
> cap height, then use `CAL_SX` to pull the width back.

### The timing

`TF(n)` converts a source frame number to seconds, and every beat is keyed to frame
numbers so the structure is legible. To retime a beat, move its frame constants; to change
the film's length, edit `data-duration` on `#root` and the driving tween.

### The resolution

Geometry is authored on a **720 × 720 design grid** and multiplied by `S` on the way out.
For 4K: set the root `width`/`height` to `2160`, and `S` follows. Nothing else changes.

## Audio

Ships silent. To add a track, drop it in `assets/` and add one element inside `#root`:

```html
<audio id="bgm" src="assets/bgm.m4a" data-start="0" data-duration="12.1333" data-track-index="1"></audio>
```

An `id` is required — audio without one renders silent.

## Layout

```
index.html                  the whole composition
hyperframes.json            project config
assets/
  cursor-point.svg          pointing hand
  cursor-grab.svg           closed hand — the grab state
  fonts/Inter-Variable.woff2
tools/fit-type.py           recompute baked text metrics
renders/
```

## Licence notes

- **Inter** — SIL Open Font License 1.1.
- The cursor SVGs are hand-drawn classic hand-cursor shapes.
- No brand fonts are bundled; they're licensed separately and referenced by name only.
