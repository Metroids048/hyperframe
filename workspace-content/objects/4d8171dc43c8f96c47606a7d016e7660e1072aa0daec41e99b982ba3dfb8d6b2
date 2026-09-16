# HANDOFF — Send to HyperFrames launch film

**Read this file, not the history.** `HANDOFF-history-2026-08-06.md` is the chronological
build log; it has useful detail but **several early entries are superseded and now wrong**
(e.g. it describes an S4 that was replaced twice). This file is the current truth.

Last updated 2026-08-07, after THREE rounds of Jake's review notes (§10, §11, §12).
State: **all notes applied, gate green, NOT re-rendered.**
The newest mp4 in `renders/` predates all three rounds — it does NOT show any of it.

---

## 1. What the film is

Launch film for the Claude Design → **Send to HyperFrames** connection. Square 1080×1080,
24fps, "Claude paper launch" aesthetic. No VO. **No audio at all yet** — see §7.

Narrative: someone makes an animation in Claude Design → sends it to HyperFrames → we pull
back to a wall of sessions → fly into another one and send that too → the thesis
("Claude designs it. HyperFrames completes it.") → what HyperFrames adds → logo.

`BRIEF.md` and `STORYBOARD.md` hold the original intent. Where they disagree with this file,
**this file wins** — Jake has re-choreographed several beats since they were written.

---

## 2. Current build

**`index.html` — 49.2763s, five scenes.** S1 grew by 0.4583s (11 frames @24) when the
cursor was slowed, then S4 lost 0.54s when the outro cut was pulled earlier (§11.3).

| slot | comp | master range | dur | what |
|---|---|---|---|---|
| `sq` | `compositions/s1-square.html` | 0 – 15.6413 | 15.6413 | K1–K4: the Design button → prompt box → typing → the plan |
| `s2` | `compositions/s2-ui.html` | 15.6413 – 27.8413 | 12.20 | K5–K7: chat rail + player, morph-out, Share → Send to HyperFrames |
| `s3` | `compositions/s3-flyover.html` | 27.8413 – 36.2163 | 8.375 | K8–K10: import card, dock, the wall, the push into project B, Share click |
| `s4` | `compositions/s4-thesis.html` | 36.2163 – 44.3763 | 8.16 | the thesis, the scramble, the world flip, the preview + value-prop video |
| `s5` | `compositions/s5-outro.html` | 44.3763 – 49.2763 | 4.90 | the HyperFrames logo outro |

**Latest render:** `renders/send-to-hyperframes-launch_2026-08-06_17-04-56.mp4` —
**STALE.** It is the pre-review-notes cut at the old 49.358s. Do not use it to judge any
of the 2026-08-07 work; re-render when Jake asks.

**Not in the film:**
- `compositions/s1-open.html` — orphan, unreferenced by `index.html`. Old 16:9-era work.
- `variants/s4-import-editor.html.bak` — the card→editor build S4 used to be. **Still holds
  the faithful K12 mcp-sessions editor and the MCP-connection explainer.** Lift it back if
  that scene returns.
- `variants/index-16x9.html.bak` — the early 16:9 verbatim replica of ref 0–10s.

---

## 3. How to run it

```
npx hyperframes@latest check --no-contrast     # the gate. --no-contrast is legitimate here (§6)
npx hyperframes@latest preview                 # studio on :3002
npx hyperframes@latest snapshot --at 1.0,2.0 --no-end -o snapshots/x
npx hyperframes@latest render --fps 24 --quality high
```

- **`UNSET HYPERFRAME_RUNTIME_URL`** before any CLI call or preview fails silently.
- **The studio writes back to disk.** Stop the preview before editing a composition, or your
  edit gets clobbered. It also injects `data-hf-id` attributes into your markup — which
  breaks naive string matching (§5).
- **Do not render** unless Jake asks. He asked on 2026-08-06 and every render since is a
  re-render of that request.
- Snapshots run their own headless browser and are **render-truth** — prefer them over the
  studio for verification. The studio has hung mid-session before.

---

## 4. Verify numerically, not by eye

This is the single most valuable habit on this project. Jake pushed back twice on work that
*looked* measured and wasn't, and nearly every round since has turned up a defect that no
amount of looking would have found. Concretely:

- **Seams**: sample the carrier's position per frame either side of the cut and compare exit
  vs entry velocity. Current seams all measured ≥99.6% matched.
- **"Double reveal" / "flash" complaints**: count *direction reversals* or check whether the
  element is visible before its tween starts. Nearly always §5.1.
- **Motion continuity**: sample composite speed per frame; a butt-joined rig passes through
  exactly 0. "Looks smoother" is not a check.
- **Layout**: read the real rect and compute from it. Cursor targets that were "obviously
  right" have landed 20px off the link.
- **Rendered artifacts**: decode the mp4 and check for flat/frozen frames. Exit code 0 is
  not proof.
- Read the transform GSAP writes (`el.style.transform`), **not** `getBoundingClientRect()`
  through the studio's preview scale — that manufactures sub-pixel noise and invents
  reversals that aren't there.

---

## 5. Traps that have actually bitten, consolidated

### 5.1 The `immediateRender: false` trap — hit FOUR times
> A `fromTo` with `immediateRender: false` does not apply its from-state until the tween
> starts. If the element becomes visible before that — its own `tl.set`, or a parent turning
> opaque — it displays in its **final** state first, then snaps back and animates in.

Symptoms Jake reported: "the items double reveal", "the icons re-reveal", "there's a frame
where the cursor is on the Share button early". **Park initial states in CSS**, or with
`gsap.set()` at parse for transforms. Never in a `tl.set(..., 0)` — a zero-duration set at
position 0 does not render on frame 0 (the linter flags this as
`gsap_timeline_set_initial_hide`), and frame 0 is a match-cut frame in S3 and S4.

### 5.2 A mask defeats a cut-the-curve
`overflow: hidden` per word **pins the leading edge**, so glyphs reveal in place with zero
travel. Tracked on the render, the ink's left edge did not move at all. Cut-the-curve needs
visible travel — no masks on words that carry a seam vector.

### 5.3 Never animate `left/top/width/height`
The linter errors (`gsap_non_transform_motion`): layout properties snap to integer device
pixels under the seek-by-frame capture engine. Use transforms. This forced rewrites of S4's
surface morph and S5's cursor.

### 5.4 `transform-origin: 0 0` is load-bearing
The "offsets are the element's own position negated" trick (used by every morph here) is
**only valid from the top-left corner**. `.slot392` defaulted to centre once and the
full-frame zoom flew off-screen with the content cropped.

### 5.5 CSS transform + GSAP on the same element
The linter errors (`gsap_css_transform_conflict`) — GSAP overwrites the whole transform.
Park transforms with `gsap.set()` at parse instead of a CSS `transform:`.

### 5.6 Assert every string replacement
The studio injects `data-hf-id` into markup, so a plain `.replace('<div class="x"></div>')`
silently matches nothing. This once left the **entire explainer absent from the document**
with tweens pointing at ids that did not exist — and the gate passed happily.

### 5.7 After any markup splice, count `<div>` vs `</div>`
One extra closer collapsed the editor's three columns on top of each other. The linter
reported it as "Tasks text overlaps Chat text", which is not an obvious description of a
broken div.

### 5.8 The stitcher renames composition root ids
`#s4` becomes `#s4-slot` in the stitched document. Selectors *inside* a composition are
rewritten for you and keep working; **external probes must query
`[data-composition-id="s4"]`**. Child ids are preserved. A ported script that does
`getElementById('root')` must be retargeted to an inner element (S3 and S5 both needed this).

### 5.9 `cqw` is a percentage of WIDTH
Porting a 1920-wide layout into a 1080-wide square rendered every `cqw` value at **56%** of
its source pixels — that is why the logo outro came out small. **Re-derive every cqw value
when re-framing**, and compose for the new aspect rather than rescaling mechanically (the
outro's lockup is 74cqw, not the 85.33 the rule gives, because 85.33 left only 80px of margin
in a square where the 16:9 source had 500px).

### 5.10 GSAP misc
- `repeat: -1` is banned by lint — compute a finite repeat.
- `.to()` reads its start value from CSS under render seeks; a card whose CSS was
  `rgba(...,0)` interpolated from *transparent*. Use `fromTo` with an explicit start.
- Properties in `from` only get animated *back* to the CSS value — pin them in `to` too.
- Absolute `y`/`height` targets stack: a later tween with an absolute value overwrites the
  earlier one.

---

## 6. Measured spec — do not re-derive

### 6a. The Claude Design reference (S1/S2 geometry)
Reference video: `~/Downloads/Introducing Claude Design by Anthropic Labs.mp4`, 3840×2160,
**24fps native**, 81.5s. Values below are native px; **divide by 2 for 1920, ×0.5625 for our
904-wide box**.

- page `rgb(243,244,237)`; world flip target `rgb(8,13,18)`
- lockup ink 1356×325 · palette 275sq · gap 125 · wordmark 956×305 · cap 220
- hover pill 1896×668 r138 `rgb(229,230,218)`
- prompt box **3214×1035 r116, dead-centre, aspect 3.11** — padding L153 R160 T191 B145
- placeholder `rgb(120,120,117)`; Send enabled `rgb(216,119,86)`, disabled `rgb(236,187,171)`
- **the morph does not ease** — one frame from nothing to 64% of the pill→box range, then a
  ~0.9s `power2.out` settle. Letters cascade OUT *before* the box lands.
- **the interior wipes in left-to-right** at ~4250 px/s
- box grows **downward** on a wrap (top −13, bottom +63) — never symmetrically
- **the accordion**: the plan stack lands over-spaced and compresses; scroll and per-gap
  spacing both decay exponentially ~0.72/frame. One analytic offset per index, `expo.out`.
- type locked as **Helvetica Neue Medium** by ink count (0.6% match), self-hosted as
  **"RefSans"** to dodge the renderer's `helvetica neue → Inter` aliasing. **The SERIF
  register is no longer Georgia** — see §9 and §10.

### 6b. S1 measured timings (re-measure if copy or typing rate changes)
The text **actually wraps at 4.708 and 5.875**; the box growths are aligned to those. Earlier
they fired 0.3–0.7s early, which was half of what Jake called "jolty".

### 6c. S3 — the grid flyover
Ported from `projects/active/sth-grid-flyover/`. **That project's `HANDOFF.md` is the
authority on every curve in S3** (all measured off
`_tools/video-reverse/reversals/grid-sting/`). Do not re-derive them here.

### 6d. Seam construction
Solve a cut-the-curve entry **on the frame, not the derivative**. `4X/D` is the instantaneous
v0 and overstates what a 24fps frame shows. Mean velocity across frame 0 is
`X·(1−(1−1/(24·D))⁴)·24`. For D=0.46 that is `7.584·X`, so matching a −1058 px/s exit needs
**X = 139**, not the 122 the derivative suggests (that was only 87.5%).

Current seams: S1→S2 is a shared-element morph **carried on a continuous camera pull that
spans the cut** — it is NO LONGER pixel-identical and must not be checked that way any more
(§11.1). S2→S3 is still a match cut. S3→S4 is a **word-by-word cut-the-curve LEFT**, 99.6%
velocity-matched. S4→S5 is a **match cut on a flat cream field** (#EDECE2 both sides), now
at 44.3763 and landing while the motion-polish puck is still travelling (§11.3).

### 6e. Key geometry constants
- cursor tip (pointing hand): **(0.386, 0.25)** of a 140px art box = (54.0, 35.0). The old
  arrow's was (6.1, 2.0) — base offsets carry the delta so measured landings still hold.
- S2 plan morph: scale **0.42325** (386/912), `tx = 22 − s·84`, `ty = 280 − s·70`
- S2 player morph: scale **2.07692** (1080/520), x −495, y −300
- S4 player slot: 392 at (292.5, 261); full-frame zoom scale **2.75510**, x −292.5, y −261

---

## 7. Open items

1. **No audio anywhere.** This is the biggest gap. The cuelume SFX set is approved
   (`reference_cuelume_sfx`), a warm minimal bed is wanted, and the brief's own argument is
   that HyperFrames adds sound — the film is currently silent, which is ironic. **The beat
   grid should be re-timed against the real bed once it exists**, which will re-open every
   seam.
2. **K13 — the recursive output** (the CTA card, "the video the agent made IS the CTA") is
   unbuilt. It was the storyboard's S7.
3. **K12 is parked, not placed.** The faithful mcp-sessions editor lives in
   `variants/s4-import-editor.html.bak`; S4 currently shows the editor briefly as the preview
   expands, then zooms into the video. If Jake wants the editor beat back properly, that file
   is the start.
4. The wall's 15 tiles in S3 are **placeholders** — swap the `art()` cases if real session
   captures land.
5. `hyperframes check --no-contrast` is legitimate here: the reference's disabled Send is
   genuinely 1.9:1 and we reproduce it faithfully; S3's 7.5px wall micro-UI is texture, not
   reading matter. The ~18 layout warnings are the wall tiles cropping through the frame
   edges mid-push — **correct by design**. Do NOT "fix" them by grouping `#world`/`.cdwin`
   into the `.cam` rule; that hands the tiles the camera transform and breaks the scene
   (tried it: 80 errors).

---

## 8. Jake's standing directions

- Square 1:1. 16:9 only for 1:1 replica verification.
- **Motion doctrine is non-negotiable** — `.claude/skills/motion-doctrine` and the technique
  skills it routes to. Load them before composing. They supersede generic guidance.
- Cursor is the **house pointing hand** (`assets/pointinghand.svg`), driven on the tip.
  `assets/closedhand.svg` exists if a press/drag state is ever wanted.
- Cursors and text **leave the frame entirely** — the frame edge does the hiding. No opacity
  fades mid-frame. He has called this out twice.
- Real assets only: `Claude_AI_symbol.svg`, `ORB.svg`, the captured HF editor tokens.
- Agent responses read like in-chat Claude: status lines, then the message.
- Paper ground `#F0EEE6`; the HyperFrames brand plate (`assets/hf-brand-bg.mp4`) is used for
  **one beat only** — the world flip after the scramble resolves. Both the thesis's setup and
  the outro are on paper.
- Two greens for "completes" by necessity: **`#2E9E5B` on cream** (the brand `#38D878` is
  unreadably light there), **`#38D878` on the dark plate**. Same hue, different ground.
- **Never render or deliver without being asked.**

---

## 9. Where the type comes from

| face | file | used for |
|---|---|---|
| RefSans (Helvetica Neue Medium) | `assets/fonts/refsans-medium.ttf` | all UI chrome, the ref-matched S1/S2 type |
| ABC Solar Display Bold | `assets/fonts/ABCSolarDisplay-Bold.woff2` | the HyperFrames brand type after the scramble |
| **Galaxie Copernicus Book** | `assets/fonts/GalaxieCopernicus-Book.woff2` | ALL serif display: the thesis, MERIDIAN, the "HyperFrames adds" plate heads, the S1 "Done.", the S3 dock + card thumbs |

Copernicus is Anthropic's own house serif, lifted from `projects/active/claude-paper/fonts/`.
It replaced `Georgia, "EB Garamond", serif` everywhere on 2026-08-07 — Jake's note was that
the serif "feels wrong, not Anthropic". Book (usWeightClass 500, italicAngle 0) is the only
weight we have, and it is declared `font-weight: 400 700` **on purpose** so the renderer
never synthesises a bold or an oblique off it — that synthesis is what got TT Norms Pro
thrown out. Existing `font-weight: 700` rules therefore render the Book outline unchanged.
**It is much wider than the Georgia it replaced** — see §10 for the sizing consequence.

**TT Norms Pro was tried and rejected**: the renderer synthesised an *oblique* even though
the TTF reports `italicAngle 0.0`. ABC Solar ships as a web-ready woff2 in sibling projects
and is the right call. Any face used must be self-hosted with an `@font-face` or the linter
errors `font_family_without_font_face` — the renderer will not resolve it.

`index.html` also loads **CustomEase** — S5's flight arc needs it. If that script tag is
removed the outro's arc silently falls back and the flight changes shape rather than erroring.

---

## 10. 2026-08-07 — Jake's review notes, applied

Eight changes. Gate green (`check --no-contrast`: 0 errors), every one verified off
render-truth snapshots, **not re-rendered**. Each note and what it actually turned out
to be:

### 10.1 The opening cursor, a further 0.75x
The whole two-stage rig is **time-scaled by k = 1.34375 about its 0.02 start**, which
preserves both `keyframe-overlap` invariants by construction — the eases are untouched and
the overlap is still 50% of stage 1. Durations 1.12 → 1.505 and 0.7733 → 1.0392; arrival
**1.3533 → 1.8117**. Everything downstream *inside S1* shifted **+0.4583 (11 frames)**, so
the comp runs 15.6413 and `index.html` moved with it (§2). The navy plate's `data-start`
moved too (5.633 → 6.0913) — a clip gate does not shift itself.

Verified: composite speed at the stage hand-off is **168 px/s, 51% of mean** — the exact
figure the pre-change file documented, confirming the shape survived the scale. (A `min`
taken over the whole rig is 0, but that is the intentional 0.28s rest on the pill before
the click, not a dead frame in the motion.)

### 10.2 The hover was firing early — solved, not eyeballed
The earlier 0.75x pass had scaled the cursor and **left the hover trigger at 0.60**, which
is the whole bug. The tip sits at `(608 + swingX + riseX, 652 + riseY)` and the pill's
bottom edge is y=634, so the crossing needs `riseY = -18`, i.e. `expo.inOut` progress
488/525 = 0.92952 → tween u = 0.64133 → **t = 0.9852** analytically. Snapshots put the true
crossing at **1.036** (the tip is 28px below the edge at 0.958 and 17px inside it at 1.083;
the model predicted the old rig's tip at y=616 for t=0.792 and the render measured 619).

Hover now fires at **1.125 — 2.1 frames BEHIND the crossing.** It was 3.3 frames early
against the old rig and would have been 9.3 against this one, which is the "eight frames"
Jake read.

### 10.3 signals.xlsx → meridian-ref.mp4
Same chip geometry and same icon language (stroked video-camera), so the pair still lands
as a matched pair and the measured chip choreography is untouched. The story is now
brief + reference cut.

### 10.4 Only the Share button drops in S2
`#s2-topbar` no longer carries a `y` — it resolves in place with the rail/canvas/player.
`.share` is parked `opacity: 0` **in CSS** (never a `tl.set` at 0) plus `y: -30` via
`gsap.set` at parse, revealed with a binary `tl.set` + `power4.out` at 0.72 — 43% through
the bar's own fade, so the two reads overlap instead of queueing. **`.topbar` gained
`overflow: hidden`** so the pill emerges from the bar's top edge instead of floating over
the paper.

### 10.5 The world flip now runs UNDER the scramble
It used to fire *at* 2.37, the frame the scramble landed on — two sequential events with a
dead frame between them. It now ignites on the **same frame as the type change (1.94)** and
has fully landed by **2.12**, a quarter-second before the glyphs stop cycling at 2.37. The
words resolve *into* the new world instead of summoning it.

**The gate was the blocker, not the opacity:** `#s4-bg` had `data-start="2.30"`, which would
have held the video out of the document for the whole fade. Now 1.94 with the duration
extended to 4.36 to keep the same 6.30 out-point.

### 10.6 The SFX beat is three timeline tracks, not five tick marks
`.rail` + 5 ticks are gone. Three labelled lanes (WHOOSH / CLICK / IMPACT) with Claude-clay
clips (`#D97757` tint, `#C4643C` waveform) that **expand left-to-right**, staggered
6.64 / 6.77 / 6.88 — gaps *shrinking* 0.13 → 0.11 (×0.846) per `cut-the-curve` §6, not a
metronome. Authored at the slot's native 392 (it is viewed through the 2.755x full-frame
zoom, so 5px reads as ~14px).

Revealed with **`clip-path`, not `width` or `scaleX`**: width snaps to integer device pixels
under the seek-by-frame engine (lint `gsap_non_transform_motion`), and `scaleX` would squash
the radius and the waveform with it. Waveform bar heights are a closed-form deterministic
function, no random.

Lane width is **236px** (306 − 62 label − 8 gap) and **every clip's `left + width` must be
≤ 236** — IMPACT was authored at 150+96 and hung out of its lane until it was caught on a
snapshot.

### 10.7 Copernicus, and the sizing it forced
See §9 for the face. The consequence that cost real time: **Copernicus is far wider than
Georgia.** "HyperFrames completes it." ran **1087px at 80px** and was clipping the final
period off the frame edge. Two things fix it together:

1. **68px, not 80px** → 937px, which is the **same measure as the ABC Solar phase (938px)**
   that follows, so the mid-scramble typeface swap is no longer also a size jump.
   `margin-top` re-centred −116 → −102.
2. **The scramble pool is width-bounded, measured off the font's own `hmtx`** — every glyph
   with an advance over 0.60em is cut (W 1.148, @ 1.108, M 1.089, % 1.045, m 1.035 … 48
   glyphs), leaving 32. A scrambled frame can now never beat the real line by more than
   0.8%; worst case is 866px. Still deterministic — smaller pool, same hash.

Old-style figures are Copernicus's default, so numerals (S2's `2.4M`, the scramble's digits)
sit on non-lining baselines. That is the face behaving correctly, not a bug.

### 10.8 New gradient plate
Jake supplied `~/Downloads/gradient-1080p-10s-1786070211754.mp4` (1920×1080, 30fps, 10.09s)
"for the gradient background". Applied to **`assets/navy-bg.mp4`** — the soft blue-teal
matches that plate's family and the comments already called navy-bg "the supplied gradient
plate", whereas `hf-brand-bg.mp4` is the *green* HyperFrames brand plate whose whole job is
to carry `#38D878`. Center-cropped to 1080×1080 (`crop=1080:1080:(iw-1080)/2:0`, crf 17) so
the crop is explicit rather than left to `object-fit`. **The old file is kept as
`assets/navy-bg-diagonal.mp4`** — restore it if the read was wrong. It is used in two
places: S1's world flip and S2's paused plate behind the Meridian card. The new plate reads
more *teal* than the "dark navy" the prompt copy asks for; flagged for Jake.

### Verification performed
- Gate: `check --no-contrast` → **0 errors**, 16 warnings (the known wall-tile crops, §7.5).
- **Seam 1 (S1→S2 morph) is still pixel-identical: MAD 0.000, 0.00% of pixels differing.**
  Seams 2/3/4 diff as expected for mid-motion cuts. The uniform S1 shift preserved the
  shared-element frame exactly.
- Cursor crossing / hover lag, thesis ink extent across every serif frame, SFX lane bounds,
  Share-only drop, flip-under-scramble: all read off snapshots in `snapshots/rev1-*` →
  `rev4-*`.

### A methodology trap worth keeping
**Pass snapshot `--at` times in ASCENDING order.** An out-of-order list made GSAP re-render
the glitch tween's start state on the backward seek, so a `t=36.85` frame came back fully
scrambled when the real forward render shows clean type there. It looked exactly like a
real bug. The render is forward-only, so this is a measurement artifact — but it will fool
you twice if you let it.

---

## 11. 2026-08-07 (second round) — Jake's notes on the preview

Five changes. Gate green, verified off snapshots, **not re-rendered.**

### 11.1 A camera on the end of S1, pulling back THROUGH the seam
The plan beat ran 12.9 → 15.3 with nothing moving but the checks — a planning-bug static
stretch, plus ~200px of dead cream under the list. It now has a camera: push in, pan down
the checklist with the checks, hold, pull back out. **The pull-out is one continuous move
that spans the S1→S2 cut**, and the second half lives in `s2-ui.html`.

Geometry measured off the settled frame (`snapshots/plan`), not computed from CSS — plan
ink spans y 77..840, line bands at 77/176/294/408 then items at 508/582/656/730/804:

| | value | why |
|---|---|---|
| scale | 1.42 | a real push without cropping the checkboxes |
| x | −63.28 | parks the plan's left edge (84) at 56 |
| y at the push apex | −9.34 | puts the top line at 100px, per Jake |
| y after the pan | −212.80 | puts the last item's baseline (840) at 980 |

At the zoomed framing items 1–4 are in frame and **item 5 is not** — that is what makes the
pan load-bearing instead of decorative. The pan lands 14.68, 0.17s before item 5's check
fires at 14.853. Measured: the top line passes **97.3px** at 13.58, the apex of the push.

**One-sided crop is deliberate.** Scaling about the plan's own centre (x=540) would crop
symmetrically — which usually reads more intentional — but it puts the checkbox column
(x≈85) at −106, i.e. off frame. The checks are the beat. So the right-hand empty pill area
crops instead.

**Both comps drive the camera from ONE analytic clock**, not chained tweens. Two reasons,
and the second is the load-bearing one:
1. Three phases writing absolute `y` on one element would stack and overwrite (§5.10) and
   trip `overlapping_gsap_tweens`. Zoom (`z`), pan (`p`) and release (`k`) are independent
   proxy channels composed in a single paint, so no two tweens share a property.
2. **The seam is not on a frame boundary** — 15.6413 × 24 = 375.4, so S1's last frame is
   master 15.625 and S2's first is 15.6667. A tween that merely "ends at the out-point"
   would have S1 leave off at scale 1.171 and S2 open at 1.210: a one-frame reversal. Both
   sides instead evaluate the same `pullEase` over the same master-time window.

Verified by reimplementing both files' camera math and the GSAP eases and walking the master
frame grid: scale runs 1.42 → 1.240 (15.625, S1) → **1.164 (15.6667, S2)** → 1.000, strictly
monotonic, no reversal. The pull's **peak velocity lands exactly on the seam frame**
(−0.064 → −0.076 → −0.060 per frame), so the cut happens at maximum scale velocity — which
is what a Z seam is supposed to do.

> **`PULL_D` and `pullEase` are duplicated in `s1-square.html` and `s2-ui.html` and MUST stay
> identical.** Change one, change the other, then re-run the frame-grid check.

`#s2-cam` wraps everything except `.ground` — the ground stays unscaled so the frame is
always painted and can never under-cover.

### 11.2 Both paused plates were still the old background
`assets/navy-start.png` and `assets/navy-paused.png` are the pre-roll and held-still frames
for the Meridian player, and `navy-paused.png` is **also** S3's `.dockplate`. Both were
generated off the old diagonal plate, which is why the paused Meridian and the grid still
looked wrong after the video swap. Regenerated from `navy-bg.mp4` at the times the
choreography actually uses — t=0 for the pre-roll, **t=6.48** for the held frame (the plate
clip is `data-start 1.72, duration 6.48`, so playback ends on exactly that frame). Old ones
kept as `navy-*-diagonal.png`.

### 11.3 Motion polish inverted, and the outro cut pulled in
Mirrored about x=115, so the puck **and** the stroke draw (which follows path direction)
travel **right → left**: guide `M226 88 L4 4`, curve `M226 88 C 134 88, 110 4, 4 4`, puck
control points x `(226, 134, 110, 4)`. That is the film's current — left-to-right made this
the one beat running against it, which is very likely why it read wrong. The rise is kept so
it still means "polish".

Compressed (draw 0.62→0.50, ride 0.80→0.62) and **S4 now ends 8.16 instead of 8.70**, so the
cut to the logo outro lands with the puck still travelling. The old out-point left 0.34s of
dead hold after it had already settled.

**Found while verifying:** the curve was showing **fully drawn** for the 3 frames between b4
becoming visible (7.40) and the draw starting (7.52) — `immediateRender: false` means the
from-state isn't applied until the tween runs. Fifth time this trap has hit (§5.1). Fixed by
parking `stroke-dasharray/dashoffset` in the CSS rule.

### 11.4 The prompt copy — Jake's line, verbatim
Was: `Make a 10-second launch animation for Meridian — dark navy, big serif numerals, count
the 2.4M signals/sec stat up.` — a product tagline, not a person typing. I drafted a
lower-case dash-chained version in his register; **Jake then supplied his own line and it is
the one in the build:**

> `Make a 10-second launch animation for Meridian. dark navy, big serif numerals, count the 2.4M signals/sec stat up please`

**Quote it verbatim. Do not "clean up"** the mixed capitalisation, the full stop after
Meridian, or the trailing "please" — those are what make it read as typed rather than
authored.

Copy changes are choreography changes. Wrap points come from RefSans's own `hmtx` advances
(822px column, 42px, −0.004em): this line breaks after chars **37 and 78**, three lines at
761/755/801px. **The model was validated against the original copy first** — it predicted
breaks at 37/79 where the file had been hand-measured to 38/80, so it is trustworthy on new
copy. Typing legs retargeted to 37/78/120; each box growth starts one half-duration (0.23s)
before its wrap, so wrap 1 lands 5.121 and wrap 2 lands 6.322.

> **Line 3 is 801px against an 822px column — 21px of headroom.** This copy is one word away
> from a 4th line, which would need a third box growth and would break the measured reference
> structure. Re-run any future wording through the metrics before trusting it.

### Still open / worth a look
- The new plate reads more **teal** than the "dark navy" the prompt copy asks for (carried
  over from §10.8). Still flagged.
- Copernicus's **old-style figures** mean `2.4M` sits on non-lining baselines in S2's stat and
  the import card thumb.
- **No audio at all** (§7.1) — unchanged and still the biggest gap.

---

## 12. 2026-08-07 (third round) — notes off the studio preview

Six notes, all applied. Gate green, verified off snapshots, **not re-rendered.**

### 12.1 The camera move-in — one channel, straight down, 2.00s
It was a push (`z`) overlapped 76% with a pan (`p`) — two properties on two eases, and Jake
read it as two movements, "over and down". There is now exactly **one progress channel `q`**,
and x is derived FROM the scale rather than animated separately:

```
a = q * r
scale = 1 + 0.48a
x     = -(scale - 1) * 118   ->  pins the CHECKBOX COLUMN at exactly x = 118
y     = -263.20a             ->  last item's baseline parked at y = 980
```

Because x is a function of scale, the checkbox column has **zero lateral movement at every
value of q** — the move can only be growth + downward travel. That column is the anchor
rather than the panel edge (x=84) because it is what the eye tracks as the checks tick;
anchoring 84 instead let the checkboxes creep 16px right across the move. A true centre
anchor would be more symmetric still but puts the checkboxes at −62, off frame.

Scale is capped by the longest label: its ink ends at x=697 and `697s − 118(s−1)` must stay
under ~1000 for an 80px margin, giving **s ≤ 1.523**. 1.48 sits under that and makes the
downward travel **263.2px** instead of 212.8 — 24% longer.

The move runs **12.80 → 14.40 (1.60s)** on the §7 nudge curve — 10/65/25 of the distance
over 20/18/62 of the time, tail 0.992s against a 0.320s ramp-in. It starts 25% into the
accordion settle (12.62–13.32) so the camera is moving before the list stops. Then a 0.80s
hold before the pull, which the last check (14.853) and the shimmer (14.59–15.21) fill.

Duration went 1.60 → 2.00 on "you dont go long enough", then back to 1.60 on "a little bit
faster" — but the **travel stayed** at the longer 263.2px / 1.48 scale, which is what that
first note was actually about. Net: 25% quicker than the 2.00s cut over a 24% longer
distance, so it is faster than either earlier version. Measured profile: peak 594 px/s,
mean 162 px/s, peak/mean 3.67.

Verified: the green check column measures a flat x=120 from 13.6 through 14.80 (dx=0 every
frame). Earlier "drift" readings were an artefact — the *leftmost element* changes as
"Claude" leaves the top of frame, which is the same trap as the ink-width proxy in §11.1.

### 12.2 The pull-out was stepped because it finished too early
The pull was 0.6426s total and landed at S2 local **0.32** — so the camera stopped and *then*
the rail, topbar, canvas and player arrived (0.34–1.20) and the plan shrank into the rail
(0.06–0.92). Two events, read as a step.

The window is now `PULL_T0 = 15.20, PULL_D = 1.30` in master time, ending at master 16.50 =
**S2 local 0.859** — so the camera is still pulling back while all of that arrives. One
continuous motion into the full UI, everything shrinking together (same Z sign both sides).

Verified on the master frame grid: **0 reversals**, 1.42 → 1.3613 (15.625, S1) → 1.3423
(15.6667, S2) → 1.000 at 16.50, peak velocity at 15.875.

> `PULL_T0`, `PULL_D` and `pullEase` are duplicated in **both** comps and MUST stay identical.

### 12.3 + 12.5 Both bars are gone; only Share comes on
Two separate bars were showing chrome:
- `#s2-topbar` (light, S2a) — had `.proj` "● Meridian launch" and `.tabs` Design/Code.
- `#s2-ovl` (dark scrim over the full-frame video) — had `.obrand` "✳ Claude Design",
  `.ochip` "meridian-launch" and `.otabs` Design/Code. **That scrim was the "menu bar" still
  showing over the full-screen Meridian.**

All of it removed, and both bar backgrounds made transparent, so the only thing that appears
in either place is the Share button. `overflow: hidden` is kept on `.topbar` — it is what the
pill slides down out of, so it now reads as dropping in from off-frame top. `.ovl` keeps its
96px height and `padding: 0 30px` because that is what parks Share at the centre **(995, 48)**
the cursor is measured against — do not collapse it.

This is a real reduction in the Claude Design app's on-screen chrome. It is what Jake asked
for twice; if it ever needs to read more like an app again, the removed spans are in git.

### 12.4 The paused Meridian dropped a frame to black
This was the actual defect behind "the background needs to still be just the very last frame".
The plate freeze itself was correct — the still is genuinely the frame the video shows at
plate time 6.48, confirmed by backing the plate out of the 42% composite and matching it
against candidate frames (t=6.48 MAD 6.0 vs t=10.05 MAD 8.0, so the framework plays the video
at natural rate, not stretched to the clip).

The bug was a **one-frame dropout at local 8.212**: full-frame mean read
`(18.5, 25.1, 39.6)` where 8.150/8.172/8.192 and 8.234 onward all read `(23, 53, 76)`. The
video clip's own gate ends at 8.20 and `tl.set("#s2-plateheld", …, 8.20)` sat on the same
boundary, so for one frame the video was gated out and the set had not landed — the player
showed bare `#0E1524`.

Fixed by never trusting a gate *or* a zero-duration set at a boundary: the video fades out and
the still fades in across the **same two frames** (`tl.to`, 0.0834s, from 8.12), so exactly one
is always painted. Same content at the same 0.42, so the only artefact is a ~3% luminance dip
across 3 frames — measured, imperceptible, and it replaced a black frame. The pre-roll
hand-off at 1.72 had the identical hazard in mirror image and got the same treatment.

> **Generalise this:** a zero-duration `tl.set` landing on a clip's `data-start` or
> `data-start + data-duration` is unreliable in this engine. Cross the boundary with a
> short explicit tween.

### 12.6 The MERIDIAN wordmark was overflowing the frame
`.vword` at 84px measured **1154.8px** on a 1080 frame — "MERIDIAN" is 556.0px inside the
player at 84px with 0.04em tracking, and the full-frame morph scales the player by 2.07692.
It was clipping the M and the N off both edges. **Copernicus is much wider than the Georgia it
replaced (§10.7), which is what introduced this.**

`.vword` **84 → 58px** → 797px, 141px clear each side.

S3's `#dock .kick` is matched to it across the S2→S3 match cut and had to move with it:
S2 renders `58 × 2.07692 = 120.46px`, the dock opens at scale 4.5003, so
`120.46 / 4.5003 =` **26.77px** (was 38.8). Verified on the seam — ink width 785px (S2 last
frame) → 784px (S3 first), same left edge x=145, cap height 207 → 206. If either side moves
again, re-derive the other from that identity.

---

## 13. 2026-08-07 — the ORANGE intro ported in, and S4's sections reversed

### 13.1 The orange hover-reveal open is now the master's opening
Ported from `projects/active/send-to-hyperframes-launch-orange/`, which was a safe fork made
to develop this one beat (its `HANDOFF.md` §"VARIANT" onward is the full development record —
v1 snap flip → v2 slow wash → v3 button-leads-field + deeper fill → v4 hover pulled earlier).

**The fork branched from this project's round-2 state, so it is OLDER everywhere else.** Only
the intro was taken. Do NOT copy that file wholesale — it would revert Jake's verbatim prompt
line, the re-fitted typing legs (37/78/120), the box growths (4.891/6.092) and the entire
round-3 camera. What was ported:

| | |
|---|---|
| `.card` rest colour | `rgba(229,230,218,0)` → **`#F3F4ED`** (opaque paper, not alpha-0 — an alpha-0 orange over cream reads as a distinct rounded rect for the 3 frames of the flip) |
| `.sunk` | new inset-shadow well layer, a SEPARATE div because the morph tweens the card's own `box-shadow` from nothing to an outer drop shadow and inset↔outset don't interpolate |
| `.lockup` | parked `opacity: 0` in CSS — the frame is bare paper until the hover |
| `#sq-paper` | id added so the whole field can wash |
| hover cluster | fires **0.9417**, `sine.inOut`: card → `#BF694D` (0.55s), lockup in (0.55s), field → `#D97757` at **1.1017** (0.50s, 0.16s BEHIND the button), well in + card to scale 0.968 |
| click | card 0.947 at 2.0913, back to 0.968 at 2.1913 — the cursor tap's own frames |
| morph | card → scale 1 and field → `#F3F4ED` both on the snap's 0.125 at 2.3123; morph's explicit start colour `rgba(229,230,218,1)` → **`rgba(191,105,77,1)`** |

Two things to know:
- **The button leads the field by 0.16s and settles one step deeper** (`#BF694D` vs `#D97757`,
  same hue at 88% value) so the inset well has something to be a recess *in* — over a fill
  that matches the field it is just a drawn line. Same `sine.inOut` on every tween; the lead
  is in the START TIMES only. Mismatched curves make the fill cross the field's mid-wash and
  flip lighter→darker, which reads as a glitch rather than a lead.
- **The hover fires 2.3 frames BEFORE the measured tip crossing at 1.036**, which inverts the
  rule §10.2 was solved for. It survives only because the wash is slow: on `sine.inOut` over
  0.55s the fill is 7.0% in at the crossing frame, so the *perceptible* onset still lands
  after the tip arrives. **If the wash is ever sped up, this start time has to come back with
  it.** The honest way to make the reaction earlier is to move the CURSOR (uniform time-scale
  about its 0.02 start, k < 1), not the response.

`overwrite: "auto"` added to the 2.3123 scale tween — the click-release runs to 2.3913 and two
absolute scale targets on one element stack (§5.10); the linter flagged the overlap.

Verified: field lands on exactly `#D97757` (217,119,87) at 1.60, pill deeper at (120,70,51),
bare cream through 0.9417, and the morph still resolves to white (255,255,255) at 2.44.

### 13.2 S4's value-prop sections slide DOWN, not up
The four "HyperFrames adds" beats used to exit to `y: -150` and enter from `y: +150` — the run
travelled upward. On Jake's note it is reversed: **exits go to `y: +150`, entries come from
`y: -150`**, so the whole chain advances downward like a reel. One direction per chain per the
vector law — keep any new beat on the same sign.

Verified on the hand-offs: the outgoing headline's band centre moves 524 → 546 → 656 (down)
while the incoming arrives at 299 and settles downward into place.

---

## 14. 2026-08-07 — the video output rebuilt as a 10s Meridian brand promo

Jake: the first video output was "quite boring" — it was a label, a count-up and a sub line
holding 6.48s of screen time on a number ticking. Replaced with a three-scene brand promo.
Design pass approved first: `design-pass/p1..p6.html`, `promo.css`,
`design-pass/shots-promo/contact-sheet.png`.

**Authored in PLAYER space (520 square) and viewed through the full-frame morph's ×2.07692**,
exactly like S4's slot392 at ×2.755. Divide any value from the 1080 design pass by 2.07692 to
land here — that is why the wordmark is 58px, not 120px. Video time maps to screen time as
`local = 1.72 + video × 0.648` (10s of video across the 6.48s playback window, the same
compression the counter had — so **Jake's prompt line still says "10-second" and is correct**).

| scene | video | local | what |
|---|---|---|---|
| 1 logo build | 0.0–2.7 | 1.720–3.470 | one hairline cell per glyph lands centre-out, then the borders fade off |
| 2 the product | 2.8–6.6 | 3.534–5.997 | arrives three-quarter, then comes alive: stats, curve, regions |
| 3 trusted by | 6.8–8.3 | 6.126–7.098 | NORTHVANE · CASSIA · HALDEN, one at a time |
| held end | 8.3–10.0 | 7.40 → | `.vend` — wordmark + the same three names |

- **No mark, no pill** (Jake). The tile idea survives as *letter cells*: glyph-width, not a
  fixed grid, so when the borders fade what remains is a properly tracked wordmark with
  nothing to reflow. The border is a **real `.pbox` element, not a `:before`** — GSAP cannot
  tween a pseudo-element.
- **The product genuinely bleeds off frame**: 568×512 at (46, 83) in a 520 box. Verified at
  full frame — panel starts at x=96 (= 46 × 2.07692) and the right and bottom frame edges are
  still panel colour.
- Scene changes ride the film's current: cut-the-curve LEFT, ~12% partial travel (62px in
  player space), mirrored power4.in / power4.out. **The full-frame morph at 4.96 lands inside
  scene 2**, so the product grows to fill the frame mid-beat — that is why scene 2 owns it.
- The chart's stroke-dash is parked **in CSS**, not in the fromTo's from-state (§5.1 — the
  same trap that showed S4's ease curve fully drawn for three frames).
- `.vwsub` now carries the three names, so **S3's `#dock .stat` was changed to match** — both
  sides of a match cut or neither.

### 14.1 The plate wash removed — and the painting-order bug it exposed
`.plate` was `opacity: .42` over the player's `#0E1524`, muting the gradient into a flat navy.
Now full strength: the plate reads (29, 91, 126) instead of (15, 41, 68). Four places moved
together — `#s2 .plate`, the pre-roll and held-still opacity tweens (also 0.42), and
**`#s3 .dockplate`**, which is the other side of a match cut. The `#0E1524` stays underneath
as the ground so an undecoded first frame still cannot flash. `.dim` (the K8 import-card dim)
is functional and was left alone.

> **The bug that cost the most:** raising `.dockplate` to opacity 1 made **S3's first frame
> render with no wordmark at all**. `.dockplate` is `position: absolute`, and CSS paints
> positioned descendants ABOVE in-flow content in the same stacking context — at .42 the
> text had been showing *through* the plate, which is why it looked correct before. Fixed by
> giving `#dock .kick` / `.stat` `position: relative; z-index: 1`. S2 is immune because its
> `.pscene` / `.vend` layers are already absolute.

> **And the verification lesson:** the earlier "match cut holds, 785 → 784" check in §12.6 was
> **measuring wall tiles**, not the dock wordmark — a full-frame bright-ink mask at S3's k0
> catches the cream tiles at the frame edges. Measure the CENTRED band (rows 430–560,
> cols 120–960). Re-verified properly: 784px, x 145..928, capH 95, identical both sides.

---

## 15. 2026-08-07 — liquid plate behind the S3 wall, and the promo's double reveals

### 15.1 The trusted-by names were double-revealing
`#s2 .pbrands span` had a CSS rest opacity of **`.92`**, so all three names were fully up from
6.126 (when `#s2-p3` turns visible) and only *started* animating at 6.30 — they showed, snapped
to 0, then animated in. §5.1 again, sixth time on this project.

Auditing the rest of the promo found the same latent fault in four more places, all now parked
at `opacity: 0` **in CSS**: `.pstat` (visible 3.534, tweened 3.86), `.prow` (3.534 / 5.10),
`.ptb`, and `.pui`. Verified: the brand row's cream ink now rises 0 → 1164 → 1829 → 2604 px
monotonically with no full-then-restart.

> **Rule of thumb for this file:** any element whose `fromTo` starts LATER than the
> `tl.set(opacity:1)` on its scene wrapper must be parked in CSS. `immediateRender: false`
> alone does not hide it.

### 15.2 The liquid plate
`~/Downloads/Liquid Acid Textures/Liquid_Loop_6.mov` (ProRes 4:2:2 10-bit, 3840×2160, 25fps,
8.52s, 171 MB) → **`assets/s3-liquid.mp4`**, centre-cropped to 1080 square, h264 yuv420p crf 19,
2.4 MB. 8.52s covers S3's 8.375s.

Two structural things it forced:

1. **It cannot live inside `<section id="scene">`.** That section carries its own `data-start`,
   and a timed `<video>` nested inside another timed element is not driven by the framework —
   it renders FROZEN. The gate catches this as `video_nested_in_timed_element`. It is now a
   direct child of `#s3-scene`, first in DOM order, so it paints behind everything in `#scene`.
2. **`#ground` had to stop painting.** It was the paper radial the wall sat on, *inside*
   `#scene`, so it would have covered the video. Now `background: transparent`. The element is
   kept deliberately — it is the layer to reach for if a tint or vignette over the liquid is
   ever wanted. `#s3-scene`'s own `#0E1524` is the opaque fallback.

Paint order is DOM order here because both the video and `#world` (`.cam`) are
`position: absolute` — the same rule that caused §14.1's dockplate bug, used correctly this time.

**Verification status:** the gate's frozen-video check passes and the markup matches
`#s2-plate` / `#sq-navy`, both of which are measured playing. Playback itself was NOT isolated
by measurement — the video sits outside `.cam` so it is stationary in screen space while the
camera moves tiles across it, which defeats a frame-diff. **Confirm on the next render.**

---

## 16. 2026-08-07 — new plates, the neutral menu hover, and the polish reveal

### 16.1 Both liquid plates replaced
| asset | source | window | prev kept as |
|---|---|---|---|
| `assets/s3-liquid.mp4` | `Long_Acid_5.mov` | 0–9s | `s3-liquid-loop6.mp4` |
| `assets/hf-brand-bg.mp4` | `Long_Acid_9.mov` | **from 1s**, 5s | `hf-brand-bg-prev.mp4` |

Both ProRes 3840×2160 25fps, centre-cropped to 1080 square, h264 yuv420p crf 19. The S4 clip
needs 4.36s from `data-start 1.94`, so 5s from the 1s mark covers it.

> **The S4 plate is now GREEN**, which suits the HyperFrames identity — but it collides with
> the one word the scene is built to land. Measured against the plate right around the thesis
> line (59, 140, 111): cream type is **3.87:1**, `completes` in `#38D878` is **2.19:1**, and
> green-vs-cream *within the line* is only **1.77:1**. So "completes" no longer pops off its
> own sentence, which is the entire reason §"two greens" exists. Two honest fixes if it reads
> wrong: set `completes` back to cream and let the plate carry the green, or put a local
> scrim behind the line. Flagged, not changed.

The S3 plate is also much lighter and busier than the orange loop it replaced (mean rgb around
(147,158,180) to (213,207,206) depending on the frame) and the wall's tiles are cream `#fbfaf6`,
so tile-vs-ground separation is lower than before. `#s3 #ground` is still in the markup with
`background: transparent` precisely so a tint or vignette can go there without new plumbing.

### 16.2 "Grey hover then orange hover" on Send to HyperFrames
`#s2 .mrow.hot` rested at `background: transparent`. GSAP treats that as `rgba(0,0,0,0)` and
raises the alpha from a BLACK base, so a tween from transparent to any warm tint passes through
visible grey on the way — that was the phantom first hover. Same family as §5.10.

Fixed twice over: the rest colour is now opaque at the menu's own `#FCFCF9`, and the hover is a
`fromTo` with that explicit start. **The hover is also no longer orange** on Jake's note — it
was `#FBEDE6` with `#B5522F` ink deepening to `#F6DFD3`; it now warms only in value
(`#F0EFE9`, press `#E7E5DD`) and the ink colour does not change at all. Measured through the
beat: row fill 221 → 219 → 216 → 209 with R≈G≈B — monotonic, neutral, no grey dip.

### 16.3 The motion-polish curve is there the whole beat
It used to draw itself in. Now the eased curve is a permanent BASE at `rgba(38,37,33,.20)` and a
second path on identical geometry (`.cp`, full `#262521`) **reveals along it**, so the line is
present for the whole beat and only the progress travels.

The progress dash is driven from **the puck's own proxy** inside `paintPuck`, not a separate
tween, so the reveal's leading edge and the puck cannot drift apart. Its dasharray comes from
the path's real `getTotalLength()` measured once at parse (guarded, falls back to 270) — a
guessed length either under-reveals or finishes early. Parametric `p` is not exactly arc-length
fraction, but on this gentle S the error is a couple of percent and both sides share it.

Verified: base line present on the beat's first frame (43.62) with zero revealed ink, then the
full-ink stroke grows 0 → 484 → 2229 → 3609 → 5501 px while the faint base is progressively
covered.

---

## 17. 2026-08-07 — RENDERED, and the full-track QC on it

**`renders/send-to-hyperframes-launch_2026-08-07_03-34-08.mp4`** — 1183 frames, 24fps,
1080×1080, high, 17.7 MB, silent. 26.7s to render. First render containing any of the six
rounds of notes above; every earlier mp4 in `renders/` predates all of them.

QC decoded **every one of the 1183 frames** (at 270px for the scan), not a sample:
- **No flat frames** — zero single-colour dropouts.
- **Both liquid plates are genuinely playing.** This closes §15.2's open question, which
  snapshots could not answer because the video sits outside `.cam` and is stationary in screen
  space while the camera drags tiles across it. S3 after the dock releases (frames 718–869):
  mean MAD 12.1, only 4 frozen frames of 151. S4's green brand plate (916–1020): mean MAD 8.1,
  5 frozen of 104.
- **The trusted-by names rise once** — 0 → 2 → 5 → 10 → 12 px of ink, no full-then-restart.
- **The polish base line is present on the beat's first frame** with zero revealed ink, and the
  progress stroke then grows 0 → 53 → 150 → 255 → 377 along it.

### 17.1 Dead time the full-track scan found — NOT yet addressed
Twelve runs of 4+ consecutive frames with literally no change. Most are legitimate commas, but
four are long enough to be planning bugs by the doctrine's own pause test:

| t | length | where |
|---|---|---|
| 46.67–49.21 | **2.58s** | S5 — the logo outro lands and then holds to the end of the film |
| 28.50–29.88 | **1.42s** | S3 — the dock holds full-frame before it releases at local 2.08 |
| 36.96–37.83 | 0.92s | S4 — thesis held between the word entry landing and the scramble at 1.69 |
| 0.00–0.54 | 0.58s | S1 — the opening. The cursor is below the frame edge on `expo.inOut`'s slow-in, so nothing visible moves at all |

The 0.88s at 24.29–25.12 (S2's menu beat) is borderline. The rest (0.2–0.4s) are the
stillness-before-climax commas and are correct.

**None of this was changed** — Jake has not raised it, and three of the four are pre-existing
scene structure rather than anything from the recent rounds. But the 2.58s tail and the 1.42s
dock hold are the two places the film actually stops, and they are the first things to fix if it
ever reads slow. The S1 opening one is a side effect of the orange intro deliberately holding
bare paper until the hover.

---

## 18. 2026-08-07 — first audio: clicks + typing. **§7.1 is partly closed.**

**`renders/send-to-hyperframes-launch_2026-08-07_03-41-37.mp4`** — 17.9 MB, 49.3s, now with an
AAC track. The film is no longer silent.

### Assets
| file | source | why this one |
|---|---|---|
| `assets/sfx/click.mp3` | `cloud-render-launch/assets/sfx/click.mp3` | 0.274s, **0.1ms onset** |
| `assets/sfx/keys.mp3` | `krillion-launch/assets/sfx/keyboard-typing.mp3` | trimmed `-ss 0.0427 -t 3.0`, faded 60ms/140ms, loudnorm −20 LUFS |

**Onset was the selection criterion, measured not assumed.** The workspace is full of click/type
files with silence baked into the head, and dropped in untrimmed they fire late:

| candidate | onset | verdict |
|---|---|---|
| cloud-render `click.mp3` | **0.1ms** | used |
| yourmax cuelume `press.wav` / `tick.wav` | 0.6ms | fine, unused for now |
| krillion `keyboard-typing.mp3` | 42.7ms | used, trimmed past it |
| figma `sfx-click.mp3` | **158.0ms** | rejected — ~4 frames late |
| cloud-render `type.mp3` / `type-short.mp3` | **393.6–394.3ms** | rejected — ~9 frames late |

Note `silencedetect` defaults to a 2s minimum and reports "no leading silence" on all of these —
it is useless here. Measure the first sample above 5% of peak instead.

### Placement
Eight clips at the ROOT with **root-absolute** `data-start` = sub-comp start + comp-local event
time, each with its own `id` and its own `data-track-index` (10–20) so they layer. An `<audio>`
without an `id` is silently dropped from renders — the gate calls it `media_missing_id`.

Click times are lifted from the **cursor PRESS tweens (`scale: 0.90`)**, not chosen by eye, so
the sound is on the press frame rather than the release:

| t (master) | cue |
|---|---|
| 2.0913 | S1 — the Design button |
| 4.3113 | S1 — click into the field |
| 10.6513 | S1 — pick Animation |
| 11.7913 | S1 — Send |
| 25.7613 | S2 — Share |
| 27.0013 | S2 — Send to HyperFrames |
| 35.3830 | S3 — Share in project B |
| 4.5913 (3.0s) | the prompt typing run |

**Typing is a continuous bed, not a tick per key.** 110 chars over 3.0s is ~37 cps — far faster
than a hand — so discrete ticks would read as a machine gun, and it would need 110 tagged tracks.

### Verified against the RENDER, not the source
All seven clicks land **within half a frame** (+0.45 frames ≈ 19ms, which is the AAC encoder
delay plus envelope granularity). The typing bed shows sustained energy only inside its window:
rms 0.000 before 4.25, 0.011 → 0.015 → 0.008 across the run, 0.000 again after 7.70.

> An onset detector reports the bed as "1.8 frames early" — that is a **false positive**. A
> continuous bed has no sharp transient, so the nearest detected onset is the decay tail of the
> 4.3113 click. Check a bed by energy window, never by onset.

### Still open
- Peak is **−9.6 dBFS** and overall rms is low, because there is still **no music bed**. Levels
  were set for SFX-over-silence (`click` 0.30, `keys` 0.20) and **will need rebalancing when a
  bed lands** — and per §7.1 a bed also re-opens every seam, since the beat grid should then be
  re-timed to the music.
- No cue yet on: the morph/box-open, the plan checkmarks, the world flip, the S3 dock/match cut,
  or the logo outro. The cuelume set in `yourmax-launch/assets/sfx/` covers all of them
  (`tick` = small UI lands, `arrival` = big card lands, `success` = the approve moment,
  `chime` = final confirmation) and its cue language is already Jake-approved.
