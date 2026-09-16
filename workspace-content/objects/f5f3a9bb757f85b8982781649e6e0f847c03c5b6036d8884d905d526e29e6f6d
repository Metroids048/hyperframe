# Spotify UI sting

A 10.8-second square (720×720) product sting built in [HyperFrames](https://hyperframes.heygen.com):
a log-in card, a listening counter, a nav, a click, a create menu, an endcard — cut
together so it reads as one continuous camera move rather than seven scenes in a row.

Everything is one `index.html`. No build step, no framework, no sub-compositions.

```bash
npm run check     # lint + runtime + layout + motion + contrast
npm run dev       # preview in the browser
npm run render    # -> renders/*.mp4
```

**Using this as a template?** Download the folder, open it with your coding agent, and say
*"turn this into a video for Duolingo."* Everything the agent needs is in the next section —
you shouldn't have to explain any of it yourself.


---

## If you were handed this and asked to re-brand it

**You are reading this because someone downloaded this project and said something like
"turn this into a video for Duolingo."** That is the whole brief you are going to get.
Here is what they expect.

The motion in this file took a long time to tune. **It is not yours to improve.** Your job
is to replace the brand layer — copy, colour, marks, type, icons, and the story the seven
beats tell — while every frame number, ease, and stamped track stays exactly as it is. If
you rewrite the animation you have failed the task even if your version looks fine on its
own, because the point of handing you this project was the motion.

### 1. Capture the brand instead of guessing it

Don't invent a palette from memory or draw a logo from description. HyperFrames ships a
capture step for exactly this:

```bash
npx hyperframes@latest capture https://<their-site> --json
```

That writes a `./capture/` directory with their real logo SVGs, screenshots, colour values,
and font references. Pull from it:

- **Marks** → replace the files in `assets/`. Run the real path bbox before you place any
  SVG; supplied art is frequently not centred in its own viewBox and a hand-guessed
  `viewBox` clips glyphs silently.
- **Palette** → the handful of hex values listed under "Making it yours" below.
- **Type** → if their face is not redistributable, substitute an open one with a similar
  skeleton and say so. Register it under a private family name — the renderer silently
  aliases real system font names and hands you a substituted face with no error.

If there is no site to capture, ask for a logo and two or three hex values. That is enough.

### 2. Write their story into the seven slots

The scene map below is seven **slots**, not seven fixed screens. Fill them with surfaces
that product actually has:

| slot | what it is | what to put there |
|---|---|---|
| A | brand lockup | their mark + wordmark, as two parts |
| B/C | an entry surface | their sign-in, onboarding, or first-run screen |
| D | one number that matters | the metric their users care about, counting up |
| E | a list of places to go | their real primary navigation |
| F | one action, taken | their real primary create/compose affordance, clicked |
| G | the endcard | "Made with" + the HyperFrames lockup |

Use their actual product language. A design tool has files and frames; a music app has
playlists; a payments app has balances. Getting this right is most of what makes the result
feel like their video instead of a recolour.

### 3. Change these, freely

- Every copy string: `NAV`, `MENU`, `MAIL`, the card markup.
- The palette values and the `assets/` marks.
- The `@font-face` block and family name.
- The icon path data in `ICO` — draw theirs, keep the 24×24 viewBox and stroke style.
- Card internals: field sizes, label positions, pill widths, radii, the surface treatment
  (filled vs outlined, light vs dark).

### 4. Never change these

- Any `F(n)` frame number, any `duration`, any clip `data-start` / `data-duration`.
- `EO` and `EI`, and every `ease:` that points at them.
- The stamped arrays — `TYPE`, `PILL`, `NUDGE`, and the shape of `AMT`. New numbers in
  `AMT` are fine; a different **count** of entries is not.
- The counter-bounce constants (amplitude, `0.279`, `0.5`).
- The scene-wrapper `x` / `y` / `scale` / `filter` tweens, and `ledger.json`.

### 5. Re-measure the two numbers that cannot be guessed

Nothing here measures text at runtime, on purpose: doing that in a browser races font
loading and returns fallback metrics. So after you relabel the nav:

1. `npm run render`
2. Open a settled frame (around frame 196) and measure each row's rendered text width.
   Mask out the highlight colour, and for the highlighted row pick a frame *before* the
   highlight arrives or you will measure the highlight and it will grow every render.
3. Paste those into `NAV[].w`, and `w + 46` into `NAV[].pw`.

If you change the shape of the create affordance in slot F — say from a wide labelled pill
to an icon-only square — three numbers move together: the button box, `#f-menu`'s
`left`/`top` (it has to open off the button's corner rather than over it), and the group
nudge that re-centres the menu afterwards. Change one, change all three.

### 6. Gates before you hand it back

```bash
npm run check     # must pass
npm run render
```

Then look at the render. Specifically check that nothing sits still at a cut, the highlight
still lands on the row you meant, and the endcard shimmer still reads.

### Traps that have each cost a round

- **`ease: "expo.out"` is not `EO`.** GSAP's built-ins of that name are a different
  polynomial and will shift every exit by 5–14 px. Pass the functions.
- **Clip boundaries must sit just *below* their frame time** (`1.166`, never `1.1667`), or
  the outgoing scene owns one extra frame at every cut.
- **Going dark needs a second nav layer.** Light type disappears on a coloured highlight,
  so a dark theme needs a near-black copy of the rows clipped to the pill rect. The
  Spotify example in this repo shows the rig.
- **An icon-only button needs a bigger entry multiple** than a wide pill, or the cut from
  the full-frame nav reads as a drop in visual mass.
- **Don't add idle motion.** Nothing in this film floats, breathes, or pulses to fill time.
  If a beat feels empty, the fix is more information, not more wobble.

---

## The two rules that make it feel fluid

Almost all of the "polish" in this piece comes from two decisions, applied everywhere.

### 1. One ease family

Every decelerating move uses the same curve, and every accelerating move uses its
mirror:

```js
const EO = (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));   // arriving
const EI = (p) => (p <= 0 ? 0 : Math.pow(2, 10 * (p - 1)));  // leaving
```

Nothing overshoots, nothing is linear, nothing bounces. Arrivals decay toward their
target with a time constant around 0.13 s; exits accelerate away. Because it is one
family, moves that were never individually tuned still look like they belong.

> **Do not swap these for `ease: "expo.out"` / `"expo.in"`.** GSAP's built-ins of
> that name are a different polynomial and will shift every exit by 5–14 px.

### 2. Matched vectors at every cut

No scene settles before its cut, and none starts from rest after one. The outgoing
element is still travelling when the frame changes, and the incoming element enters
already moving on the **same axis, in the same direction, at a similar speed**.

`ledger.json` is that plan written down — one row per cut, with the axis and sign
each side must satisfy:

| cut | frame | out | in |
|---|---|---|---|
| logo → sign-in | 36 | rising | rising |
| sign-in → zoomed | 73 | leftward | leftward |
| zoomed → counter | 114 | rising | rising |
| counter → nav | 155 | rightward | rightward |
| nav → create | 210 | pulling back (scale ↓) | pulling back (scale ↓) |
| menu → endcard | 305 | pulling back (scale ↓) | pulling back (scale ↓) |

If you re-time a scene, fix its neighbours' vectors too — that is the whole trick.

---

## Scene map

| # | frames | what happens |
|---|---|---|
| A | 1–35 | Lockup fades up and grows. Mark and wordmark **counter-bounce** in antiphase, then the whole thing rises out of frame, accelerating. |
| B | 36–72 | Sign-in card enters from below, a gloss sweeps the primary button, the card exits left. |
| C | 73–113 | The same card at 1.53×, entering from the right still moving left. The email types in. Rises out. |
| D | 114–154 | Listening card rises in, the number runs 0 → 5,278 on an odometer, exits right. |
| E | 155–209 | Nav rows waterfall in from the left, staggered. A cyan highlight makes one continuous move from the first row to the third. |
| F | 210–304 | Create button arrives oversized and contracts. A cursor walks in and clicks; the click opens the menu; the group nudges aside to give the menu the frame. |
| G | 305–325 | "Made with" + lockup lands. The landing kicks the pair apart and they settle back; a shimmer runs through the mark. |

---

## Techniques worth stealing

**The counter-bounce (scenes A and G).** A two-part mark reads as alive if the parts
move against each other instead of together. Both scenes drive a damped spring and
give one part `+A` and the other `−A`:

```js
const A = 19 * Math.exp(-t / 0.279) * Math.sin((2 * Math.PI * t) / 0.5);
```

On the endcard, "Made" and "with" are separate spans on a 2-frame stagger of that
same spring, so the label has life instead of sliding as one block.

**Stamp choreography, ease physics.** Anything that is a *curve* is a tween. Anything
that is a *decision* — the typing rhythm, the odometer values, the highlight's path
through the nav — is stamped frame by frame with `tl.set(...)`, which keeps it exact
and seek-safe under the renderer.

**Two copies of the nav.** On a dark ground the rows are white, and white type vanishes
on the green highlight — so `#e-inv` is a second, near-black copy of the same list,
clipped to the pill rect and moved with it. The light-ground examples in this repo do
not need it, because their row type stays dark on the highlight either way.

**Uneven on purpose.** The nav rows are not evenly spaced and the typing is not evenly
timed (three characters land on double frames). Perfect regularity reads mechanical.

**Derived blur.** Fast moves carry a blur that ramps with the same ease as the motion,
so it peaks exactly when the element is fastest.

**No idle motion.** Nothing floats, breathes, or pulses to fill time. Pause on any
frame and something is mid-flight.

---

## Making it yours

Most edits are data, not code.

- **Copy** — the strings in `NAV`, `MENU`, `MAIL`, and the card markup.
- **Nav labels** — `NAV[].w` is the row's rendered text width (its off-screen start)
  and `NAV[].pw` is where the highlight rests on it (text width + 46). Change a label,
  render once, measure, paste the two numbers back. The highlight's stamped track is
  re-anchored onto them, so relabelling never disturbs the timing.
- **The counter** — replace the `AMT` array. The last digit carries a permanent
  vertical smear (an SVG `feGaussianBlur` with `stdDeviation="0 2.1"` — a CSS blur is
  isotropic and reads wrong for a rolling digit).
- **Colour** — `#1db954` accent, `#ffffff` ink, `#121212` ground, `#2f2f2f` hairlines.
- **Length** — the whole film is keyed off `F(n)`. Retiming means moving frame numbers,
  and re-checking the seams either side of anything you move.

Nothing measures text at runtime, on purpose: `measureText` in the browser races font
loading and hands back fallback metrics. Measure from a render, bake the number.

---

## Fonts

`assets/fonts/` ships **Figtree** (SIL OFL). It is an open licence, so this example
is redistributable as-is — swap in your own face by replacing the file and the single
`@font-face` block at the top of `index.html`.

The face is registered under a private family name rather than its real one. That is
deliberate: the renderer silently aliases system font names and hands you a substituted
face with no error.

## Trademarks

The mark in `assets/` is a simplified geometric redraw, and the wordmark is set in the
open face above rather than traced from the real logotype. This is a motion-technique
demo, not an official Spotify asset, and it is not affiliated with or endorsed by Spotify.
Swap `assets/spotify-mark.svg` and the strings in `index.html` for your own brand before shipping
anything real.

## Audio

Ships silent. Add a bed as a clip on its own track:

```html
<audio id="bed" class="clip" src="assets/audio/bed.m4a"
       data-start="0" data-duration="10.798" data-track-index="9"></audio>
```

It needs the `id` — an `<audio>` clip without one renders silent.

## Notes

- The CLI version is pinned in `package.json` so this renders identically over time.
  To move up: `npx hyperframes@latest upgrade --project . --check`, then drop `--check`.
- `data-layout-allow-*` attributes mark intentional overlap and off-canvas motion so
  `check` does not flag the entries and exits as layout bugs.
- Timings assume 30 fps. `F(n) = (n - 1) / 30`; clip boundaries sit just *below* their
  frame time (`1.166`, not `1.1667`) so the incoming scene owns that frame.
