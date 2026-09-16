# HeyGen — message sting

A 12.8-second square sting built entirely in one HTML file. A stack of video
tiles flips into a chat: the agent thinks, a message asks *"Can we add these
assets?"*, a plus button answers, a b-roll card gets grabbed and docked, the
HeyGen app grows a store listing, agent status cards conveyor through, and the
film closes on a text selection: **Keep creating**.

No video, no image sequences. Every pixel is DOM + SVG driven by a single
paused GSAP timeline, so it renders deterministically at any resolution.

```
720 × 720 · 12.83 s · 30 fps · silent
```

**Using this as a template?** Download the folder, open it with your coding agent, and
say *"turn this into a video for Linear."* Everything the agent needs is in the next
section — you shouldn't have to explain any of it yourself.

---

## If you were handed this and asked to re-brand it

**You are reading this because someone downloaded this project and said something like
"turn this into a video for Linear."** That is the whole brief you are going to get.
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
| the tile stack | a set of outputs, stacked | their content objects |
| the thread | a request typed into a chat | how someone asks their product for something |
| the plus | one action, taken | their real add / attach affordance |
| the grab | an object dragged and docked | their drag-and-drop surface |
| the store row | the product, listed | their app / marketplace listing |
| the conveyor | status moving through | their queue, activity or progress rows |
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

**Every scene change is a shared-element morph.** There are no cuts and no
crossfades between scenes — one object always carries the eye across:

- the card stack collapses edge-on (`scaleX → 0`) and the chat bubble unfolds
  from the same axis;
- the camera **zooms through the middle typing dot**, which becomes a circle of
  scrambled glyphs (nine long strips sliding continuously in alternating
  directions);
- the glyph circle condenses into a dot that inflates into the send bubble;
- the bubble does a diagonal edge-on flip and unrolls as the plus icon;
- the grabbed b-roll card shrinks into the exact rect where the app icon lands.

**One easing law.** Entries are exponential-out with long tails, exits are
exponential-in, stated once as explicit functions at the top of `index.html`
(GSAP's built-in `"expo"` is a different polynomial — the explicit form keeps
entry and exit velocity mirror-symmetric across each seam).

**Velocity-matched motion blur.** Blur ramps in with acceleration
(`power2.in`, peaking exactly at each seam) and clears with deceleration.
One subtlety: CSS `blur()` scales with the element's transform, so the zooming
wrapper carries a raw 2.2px that reads as ~18px at ×8 scale.

**The status-card conveyor.** Each card surfaces near the frame bottom and
rides up to its slot on a long deceleration; the "rise" of the whole stack is
actually a scale about a bottom-right origin, followed by a linear drift while
cards accelerate off the top — three cheap transforms that read as one
organic crane move.

## Make it yours

- **Brand color** — search `#00c3ff` (accent) and `#10121a` (ink).
- **The message** — `#d-msg` in the markup.
- **The tiles and cards** — swap the JPEGs in `assets/` (the opening tiles,
  the draggable card, and the two status-card thumbnails), and edit the
  `CARDS` / `HROWS` arrays at the top of the script for copy and layout.
- **The closer** — the `#i-keep` / `#i-listen` spans ("Keep creating").
- **Fonts** — ships with Inter; drop any variable font into `assets/fonts/`
  and update the single `@font-face`.

The archival photographs are public-domain expedition images (M. A. Stein,
1900s) used as placeholder content — replace them with your own footage stills.
