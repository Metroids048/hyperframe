# HeyGen — generate reel

An 11.8-second square film built entirely in one HTML file. A phrase is selected like text,
submitted, and the work happens in front of you: a glass panel fills with progress, then the
results arrive as a folder of cards that gets pulled out and whipped off frame.

No video editor, no image sequences. Every pixel is DOM + SVG driven by a single paused GSAP
timeline, so it renders deterministically at any resolution.

```
720 × 720 · 11.8 s · 30 fps · silent
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
| the selection | a phrase selected like text | the thing someone asks their product to make |
| the submit | one action, taken | their primary submit affordance |
| the generate card | work happening, with a progress fill | their real loading state and its metric |
| the folder | the results, arriving as objects | their output objects — cards, files, tracks, tiles |
| the exit | the stack whipped off frame | — |

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
- The cursor path. It is one continuous bezier driven by a proxy, and every tween after
  it is an explicit `fromTo` with `immediateRender: false` — see the seek-safety note below.

### 5. Re-measure anything that depends on rendered text

Nothing here measures text at runtime, on purpose: doing that in a browser races font
loading and returns fallback metrics. So if you relabel anything whose geometry is derived
from its own width, render once, measure off the frame, and paste the number back.

The two places that matter here are the selection band (sized to its phrase) and the
folder card labels.

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
npm run check     # lint + runtime + layout + motion + contrast
npm run dev       # preview in the browser
npm run render    # -> renders/*.mp4
```

## What's interesting about it

**The liquid fill.** The progress bar isn't a scaling rect — it's an SVG path whose leading
edge is a travelling wave, computed as a pure function of progress so it's identical on
every render. The meniscus is concave, and the fill's leading edge wobbles the way a liquid
front actually does.

**Reaction overlaps cause.** The pill pulse and the card pop start *before* the fill
finishes, and the full-charge swell crests directly into the exit rather than settling first.
Nothing in the film comes to rest and then starts again.

**The cursor is one continuous arc.** It enters blurred from off-frame, rotates upright as it
travels, grabs a card by a computed corner, and stays glued to that corner through the pull —
it's a child of the card and counter-rotated, not an independently animated sprite.

**The folder is a real pocket.** Cards sit in fixed slots at their own angles and slide along
their own axes, so their bottoms never clear the flap. The flap sits above the slots in z, and
individual slots z-bump only at the moment they escape.

## Seek-safety — the one hard rule

The renderer seeks the timeline rather than playing it, and a prewarm seek suppresses
`onUpdate`. Anything positioned by an `onUpdate` callback will be in the wrong place on the
rendered frame. That's why every cursor tween after the opening arc is an explicit `fromTo`
with `immediateRender: false`, and why per-frame choreography is stamped rather than
computed. Keep that pattern if you touch the cursor.

## Making it yours

- **Copy** — the selected phrase, the card title, the folder label, the card captions.
- **Colour** — `#00c3ff` accent, `#7559ff` secondary, `#10121a` ink. The panel is a glass
  material: backdrop-blur plus inset highlights plus a sheen sweep.
- **The card faces** — three `<video>` elements in `assets/`. Point them at your own footage,
  or swap them for static art; the slots don't care what's inside.
- **Resolution** — the canvas is 720², declared on `#root`. Change it there and the layout
  scales with it.

## Licence notes — read before publishing

`assets/fonts/` contains **TT Norms Pro**, a commercially licensed face. A licence to use it
in your own work does not automatically cover redistributing the files in a public
repository. Confirm your licence covers it, or delete the folder and the `@font-face` blocks
— the stack falls back cleanly, and the layout holds because no width is measured at runtime.

`assets/card-*.mp4` are product demo clips featuring identifiable people. Replace them with
your own footage before publishing anything real.

## Audio

Ships silent. Add a bed as a clip on its own track:

```html
<audio id="bed" class="clip" src="assets/bed.m4a"
       data-start="0" data-duration="11.8" data-track-index="9"></audio>
```

It needs the `id` — an `<audio>` clip without one renders silent.
