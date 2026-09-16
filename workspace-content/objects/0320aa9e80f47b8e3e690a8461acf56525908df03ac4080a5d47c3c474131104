> **SUPERSEDED — chronological build log, 2026-08-06.**
> Read `HANDOFF.md` instead; it is the current truth. Several entries below describe builds
> that were later replaced (S4 in particular was rebuilt three times), so taking any single
> entry here at face value will mislead you. Kept for provenance and for the measurement
> detail behind decisions.

# HANDOFF — Send to HyperFrames launch film + Claude Design reversals

Written 2026-08-06. Two related things are live: a **launch film** (square) and a
**1:1 replica campaign** against Anthropic's Claude Design video. Expect the next
stretch to be a *mixture of video-reverse work and original composition* — read the
"How to work here" section before touching anything.

---

## 1. What exists

| path | what it is | state |
|---|---|---|
| `projects/active/send-to-hyperframes-launch/` | the launch film, **square 1080×1080**, scenes 1–4 (17.6s) | gate green, rendered, NOT delivered |
| `projects/active/plan-sequence-replica/` | standalone **16:9** 1:1 replica of ref 18–21s (the plan/checklist beat) | gate green, framediff median IoU 0.22 |
| `projects/active/send-to-hyperframes-launch/variants/index-16x9.html.bak` | the earlier 16:9 verbatim replica of ref 0–10s | parked (moved out of root so only one composition is discovered) |
| `projects/_tools/video-reverse/reversals/claude-design-s1/` | evidence for ref 0–10s (per-frame `track.json`) | keep |
| `projects/_tools/video-reverse/reversals/claude-design-plan/` | evidence + QC for ref 18–21s | keep |

**Reference video (the good one):**
`~/Downloads/Introducing Claude Design by Anthropic Labs.mp4` — 3840×2160, **24fps native**, 81.5s.
There is an older 1080p copy of the same cut (`@claudeai_2045156267690213649_1080p.mp4`); prefer the 4K.

---

## 2. How to work here — this is the part that matters

Jake pushed back hard, twice, on work that *looked* measured but wasn't. The rule:

> **When he says "use video reverse", RUN the skill** — `projects/_tools/video-reverse/skills/video-reverse/SKILL.md` —
> not an ad-hoc imitation of it.

Load these before measuring anything: `references/static-layer.md`, `motion-fidelity.md`,
`first-try.md`, `type-forensics.md`. Skipping them cost three rebuild rounds.

Non-negotiables that were learned the expensive way:

1. **framediff is the gate, not your eyes.**
   `python3 skills/video-reverse/scripts/framediff.py <ref> <replica> <out> --ref-start S --dur D --fps 24 --mask colordist`
   Run it from the `video-reverse` repo root. Read the **triptychs** (red = reference ink
   you're missing, blue = ink you invented) and the **mass** column, not just IoU. Absolute
   IoU is noise-floored by font substitution — rank, don't threshold.
2. **The author does not grade the work.** Every "this looks right" that wasn't framediffed
   came back as a correction.
3. **Measure, don't infer.** The typing rate was called "accelerating" from an energy curve;
   char-count evidence said linear-ish. The morph was called an ease; frame data said it
   *snaps 64% in a single frame*. Both were wrong until measured directly.
4. **Verify the replica with the same instrument as the reference.** Render, then run the
   identical bbox/tracking script on your own output and diff the numbers.
5. **Assert every string replacement.** Studio write-back injects `data-hf-id` attributes
   and silently breaks match-strings. A python edit that "succeeded" but matched nothing
   cost a whole round.

---

## 3. Measured spec — Claude Design reference

All values **native 3840×2160**; divide by 2 for a 1920×1080 build.

### 3a. Opening (ref 0–10s)
- page `rgb(243,244,237)`; world flip target `rgb(8,13,18)`, flip 4.45→4.67 (0.22s)
- lockup ink 1356×325 · palette 275sq · gap 125 · wordmark 956×305 · **cap 220**
- hover pill 1896×668 r138 `rgb(229,230,218)`; appears ~0.42
- prompt box **3214×1035 r116, dead-centre, aspect 3.11** — padding L153 R160 T191 B145
- placeholder `rgb(120,120,117)`; Send enabled `rgb(216,119,86)`, disabled `rgb(236,187,171)`
- **the morph does not ease** — f39 (1.625) has no box, f40 (1.667) is already at 64% of
  the pill→box range, then ~0.9s `power2.out` settle
- letters cascade OUT from 1.50, gone by ~1.72 — i.e. *before* the box lands
- **the interior wipes in left-to-right** at ~4250 px/s (1.764→2.142). The "Send fill pops
  in one frame at 2.125" falls out of this for free — it's the rightmost element.
- gap from last text line to the button row = **143px** (at 1920 scale)
- box grows **downward** on a wrap (top −13, bottom +63) — do NOT grow it symmetrically
- box scales to **0.645** over 6.17→7.50; file chips land 7.12

### 3b. Plan sequence (ref 18–21s)
- "Soldering…" status 18.0–18.6 (coral dotted ring + serif italic)
- settled layout at 1920×1080: column x345 w1176 · Claude y54 · Plan y160 · write_file y294
  · Progress y428 · items from y557, **pitch 95**, item font ~49, checkbox 40
- **check-offs: 18.83 / ~19.40 / ~19.42 / 19.54 / 20.50** — burst of three, long hold, one alone
- **the accordion**: the stack lands over-spaced and compresses. Both the global scroll and
  the per-gap spacing decay exponentially (~0.72/frame):

  | ref t | scroll | spacing/gap |
  |---|---|---|
  | 18.833 | 459 | 49 |
  | 18.917 | 206 | 34 |
  | 19.000 | 92 | 17 |
  | 19.125 | 18 | 6.5 |
  | 19.250 | 0 | 0 |

  Implement as ONE analytic offset per section: `y = scroll(t) + S(t) × index`, `expo.out`.
- camera push: scale 1 → **1.484** (19.42→20.25), plateau, then a second push to 1.633 that
  is still accelerating when the cut lands at 21.0 (a zoom-through).

### 3c. Type
No font-ID instrument exists; the true face (likely Styrene) is not on this machine.
Locked **Helvetica Neue Medium** by dual constraint against the wordmark — ink extent
945 vs 957 (−1.3%), **ink COUNT 88011 vs 88526 (0.6%)**. Extracted from `HelveticaNeue.ttc`
face 10 and renamed **"RefSans"** so the renderer's `helvetica neue → Inter` aliasing
cannot fire. Lives at `assets/fonts/refsans-medium.ttf` in both projects.
Body text needed weight 600 at 74px to match ink; the wordmark is 500.

---

## 4. Traps that will bite again

- **`.to()` reads its start value from CSS under render seeks.** A card whose CSS was
  `rgba(...,0)` interpolated from *transparent*. Use `fromTo` with an explicit start.
- **`fromTo` defaults to `immediateRender: true`** — the from-state paints at t=0. Always
  pass `immediateRender: false` for a fromTo that starts later in the timeline.
- **Properties in `from` only** get animated *back* to the CSS value. Pin them in `to` too.
  (This made the morphing box fade back to pill-colour over 0.9s — framediff caught it.)
- **Absolute `y`/`height` targets stack**: a later tween with an absolute value overwrites
  the earlier one. A 4-line height tween silently undid the chips height.
- **A from-state applied *after* something becomes visible = a flash of the end state.**
  Park elements with `tl.set` before the container fades in.
- **Vertical values don't scale between 16:9 and 1:1** — both are 1080 tall. Only horizontal
  offsets take the k factor. (Scaled a cursor's absolute y once; it floated off the button.)
- `hyperframes check --no-contrast` is legitimate here: the reference's disabled Send is
  genuinely 1.9:1 and we reproduce it faithfully.
- Studio **writes back** to disk — stop the preview before editing composition files.

---

## 5. Open items

1. **Camera push fidelity (plan sequence).** IoU drops to ~0.16 mid-push. Cause is known:
   the reference's pan is **non-monotonic** (item-1 x goes 405 → 453 → 300 → 290) because
   the list is still scrolling while the zoom runs — two overlapping motions, modelled as
   one. Fix by fitting the pan per-frame from the tracked positions. Residuals are already
   in `reversals/claude-design-plan/`.
2. **The globe** in the 16:9 opening replica is a CSS approximation; the reference has a
   rendered 3D sphere with continent outlines and city labels.
3. **Launch film scenes 5–13** are still only a design pass (`design-pass/contact-sheet.png`,
   13 keyframes). STORYBOARD.md carries the plan: grid of sessions → second send → the
   "completes" text beat → HF editor → recursive output.
4. The **HyperFrames editor UI** (scene 12) was captured live from
   `hyperframes.dev/mcp-sessions/…` — tokens are in `design-pass/k12.html`. Jake's session
   needed his login; it is not publicly reachable.

---

## 6. Jake's standing directions

- Square 1:1 for the launch film; 16:9 only for 1:1 replica verification.
- Paper aesthetic: `#F3F4ED` ground (Bracken Miss Printed "Velvet" texture at 0.42 multiply
  when texture is wanted), flat navy `#0E1524` for the dark ground — **not** a globe.
- Cursor = the no-ai-slop house arrow, driven on the **tip** (tip is at x-fraction 0.083 of
  the art). Its rise and rightward swing must **overlap ~39%** (keyframe-overlap doctrine)
  — he will notice if it turns a corner.
- Real assets only: `Claude_AI_symbol.svg` and `ORB.svg` at the project root; the palette
  icon and cursor are lifted from reference frames, not hand-drawn.
- Agent responses read like in-chat Claude: status lines, then a big starburst with
  "Thinking…", swapping **in place** for "Done."
- **Never render or deliver without being asked.** Renders so far are QC artifacts.

---

## 2026-08-06 (rev 3) — restructured ending, pointing-hand cursor, video ground

The film is now **19.90s across two comps**. `index.html`: S1 `0–14.30`, S2 `14.30–19.90`.

### The seam is a MORPH, not a cut
The camera push onto the last checklist item and the leftward cut-the-curve were both
**removed** at Jake's direction. S2 now opens on a frame **pixel-identical** to S1's last
(verified: mean abs diff 0.0/channel, **2 pixels** differ >5 across 1080x1080) and shrinks
the plan into the chat rail. The plan is the *same markup at S1's metrics* inside
`#s2-planmorph`, scaled by **0.42325 = 386/912** (rail content width / S1 plan width);
with `transform-origin: 0 0` that gives `tx = 22 - s*84 = -13.55`, `ty = 280 - s*70 = 250.37`.
**If you change S1's plan CSS you must change S2's identically or the seam pops.**

### Cursor is the pointing hand
`assets/pointinghand.svg`, 140px box. Ink tip measured at **(0.386, 0.25)** of the box
= (54.0, 35.0); the old arrow tip was (6.1, 2.0). `.cursor-swing` left/top were shifted by
that delta to **554 / 617**, so every previously measured landing point still holds —
verified: tip starts at y=1122 (off-frame) and lands at **(608, 597)**, inside the pill.
`transformOrigin` for the click squash is now `38.6% 25%` (6 sites).
`assets/closedhand.svg` is present but unused — available for a press/drag state.

Opening arc: 50% overlap, stage 1 `expo.inOut` 0.84s, stage 2 `power2.inOut` 0.58s.
Legs 2 and 3 are **pure diagonals** (x and y on one wrapper, one interval) — the two-stage
rig is for the opening only.

### Two bugs worth remembering
1. **The chips' "double bounce" was not the ease.** The card's height tween at 5.95 grew it
   symmetrically with no `y`, so its top jumped up 42.5px *under* the chips mid-entry.
   `y: 82.5` alongside `height: 462` keeps the top fixed (measured drift now 0.43px) and
   each chip shows exactly **1** direction reversal.
2. **Measuring rects through the preview's scale factor manufactures reversals.** Read the
   transform GSAP writes to `style.transform` instead, and window the sample to the tween's
   own range — an `immediateRender:false` from-state snaps at tween start and reads as a
   direction change that is not visible.

### Other rev-3 changes
- Navy ground is now `assets/navy-bg.mp4` (supplied plate, centre-cropped 1920→1080 square,
  7s, no audio), a framework clip at `data-start="5.30" data-duration="6.60"`. Flat `#0E1524`
  stays underneath so an undecoded first frame cannot flash.
- Prompt caret **blinks** 3.16→11.10; composer caret blinks too. Both use a computed
  `repeat` (15 and 7) with `steps(1)` — `repeat: -1` is banned by lint.
- "Done." is gone. S2's rail carries a **normal inline Claude response** (paragraph +
  copy / read-aloud / overflow icons) and a **composer pinned bottom-left**.

---

## 2026-08-06 (rev 4) — S2 built through K8; film is 27.80s

`index.html`: S1 `0–14.30`, S2 `14.30–27.80`. S2 is one comp (13.50s) covering **K5–K8**,
because the player element has to persist through the morph-out.

| beat | S2 local | what |
|---|---|---|
| K5 S2a | 0.00–1.72 | plan morphs into the rail, chrome builds, reply + composer |
| —      | 1.72–8.20 | playback: counter 0→2.4M, scrub 0→100% |
| K6 S2b | 4.96–5.90 | **morph-out at exactly 50% playback** (1.72 + 6.48/2 = 4.96) |
| K7 S2c | 7.24–11.46 | wordmark resolve → chrome over video → Share → Send to HyperFrames |
| K8 S2d | 11.60–12.64 | menu closes, video dims, import card lands, ✓ Imported |

**The morph-out offset trap.** `#s2-player` has CSS `left/top` (495,300), so its transform
is relative to *that* corner: `x:-495, y:-300` with `scale: 2.07692` lands it on
(0,0,1080x1080) — verified exact. Scaling the offsets by s as well (`-1028, -623`, the
convention the `inset:0` plan wrapper correctly uses) throws it 533px off-frame left.
**Wrapper at inset:0 → offsets in frame coords. Element with left/top → offsets relative
to its own corner.** The layout linter caught this one.

**Scrub continuity.** The in-player bar and the whisper-thin frame-bottom line are painted
from ONE progress proxy in a single `onUpdate`, so the hand-off at the morph cannot drift —
verified 0 mismatched frames across the swap.

**Cursor targets are measured, not guessed.** First pass missed both: Share sits at
(940, 27.5, 110x41) not (900,40), and the Send-to-HyperFrames row at (715.5, 326, 333x45).
Base is now left 941 / top 13 (tip (54,35) → Share centre (995,48)); leg 2 travels
(-115, +300) to put the tip at (880, 348). Both verified inside their rects, no dead stops.

Still open: **K9–K13 unbuilt** — the session wall (S3), the faster reprise (S4), the
"completes" text beat (S5), the HyperFrames mcp-sessions editor (S6), the recursive output
(S7). No audio anywhere. Gate green, NOT rendered.


---

## 2026-08-06 (rev 5) — reveal craft + the morph fix

- **Pill -> box morph.** The reference's one-frame snap to 64% was built literally, and
  that is exactly why it read as "not actually morphing": width, radius, colour AND shadow
  all jumped on the same frame (533->771 in one step), which the eye takes as a cut to a
  different object. The 64% landing is kept but the element now travels there over 3 frames
  from the pill's real state. Measured largest single-frame width step: **238px -> 108px**.
  The palette icon now scales down as it fades (1.52, 0.15s) so it reads as absorbed.
- **Green shimmer** on the last plan line: a green copy of the label masked by a moving
  gradient band, driven from a proxy (`maskPosition` as a pure function of progress).
  Sweeps 13.42-13.92, gone by 13.958, check fires 14.03 — verified it clears first.
- **Claude reply reveals line by line.** Six hand-broken `.rline` mask boxes (29px, overflow
  hidden), inner span `yPercent 100 -> 0`, stagger 0.075. Lines are `white-space: nowrap`
  and hand-broken on purpose — natural wrapping cannot be masked per line.
- **Composer placeholder** is split into per-character mask boxes at parse time and rises
  letter by letter (stagger 0.022, 16 chars = 0.35s, inside the 500ms stagger budget).
  The attach / + / send buttons use the file-chips overshoot (`back.out(1.7)`, stagger 0.09)
  — measured 9.8% overshoot vs the chips' 10%, one reversal each.
- **The gradient plate pauses** rather than vanishing: the video clip now ends exactly when
  playback does (`data-duration 6.48`, ending 8.20) and `assets/navy-paused.png` — the frame
  at t=6.48 — takes over on that same frame. Verified 18 pixels differ across the swap.
- **HeyGen ORB** placed as in the design pass: 22px in the Share menu's Send to HyperFrames
  row (k07), 30px in the import card header (k08). Source is `ORB.svg` at the project root.

Gotcha worth keeping: in the stitched preview the composition root id `#s2` is rewritten to
`#s2-slot`, so external probes must query `[data-composition-id="s2"]`. Selectors *inside*
the composition are rewritten for you and keep working.


---

## 2026-08-06 (rev 6) — reveal + growth polish

- **Prompt-box wrap growth.** Was 0.10s `power2.out` per wrap — max velocity from frame one,
  i.e. a snap. Now 0.28s `power2.inOut`, starting ~0.06s BEFORE the wrap so the box
  anticipates it, and `#sq-card` gained `overflow: hidden` so the new line is *revealed by*
  the growing box instead of spilling below it while the box catches up. The chips growth
  and the `#sq-ptext` shift were widened to 0.34s to match. The y values already hold the
  top edge still (drifts <1px across all three growths) — don't "fix" them.
- **Shimmer was invisible for a real reason.** `mask-position` in PERCENT against an
  oversized mask (`mask-size: 260%`) resolves against `(element − mask)` width, which is
  negative, so the band sat outside the glyphs for most of the sweep. Rebuilt on
  `background-clip: text` with the gradient offset driven in **pixels** (−420 → +430 over a
  420px band, 0.72s, 13.16→13.88). Verified frame by frame: green travels P → easing →
  timing and clears before the 14.03 check.
- **S2's "You" prompt** now reveals line by line like the reply (3 hand-broken `.rline`
  boxes). NOTE: the reply's tween had to be scoped to `#s2-reply .rline span` — a bare
  `#s2 .rline span` now also matches the prompt's lines and folded them into its stagger.
- **Share-menu double reveal** — same `immediateRender: false` trap as the seam entry: the
  rows had no opacity before their `fromTo`, so they were fully visible through the
  container's fade, then snapped to 0 and faded in a second time. Rows are now hidden in
  **CSS** (`#s2 .s2mi { opacity: 0 }`) and revealed once. Note the linter's
  `gsap_timeline_set_initial_hide`: a zero-duration `tl.set` at position 0 does NOT render
  while the playhead sits exactly on 0 — initial hidden states belong in CSS.


---

## 2026-08-06 (rev 7) — cursor stays, box entries, corrected wrap timing

Film is **28.35s**: S1 `0-14.85`, S2 `14.85-28.35`.

**The wrap growths were mistimed and that was half the "jolt".** Measured: the text actually
wraps at **4.375** and **5.542**, but the growth tweens fired at 4.083 and 4.833 — the second
one **0.71s early**, so the box expanded, sat empty, and only then received the line. Growths
now start on the measured wrap (4.30 and 5.46; verified landing at 4.375 / 5.500). If the
copy or the typing rate changes, RE-MEASURE the wraps — don't reuse these numbers.

**Cursor no longer vanishes after the Design click.** It drifts slowly to just below the
prompt box (1.72-2.66), holds while the box settles, comes back up on a diagonal (2.94-3.52),
and clicks the field. That click is the cause of everything downstream: placeholder out,
caret in, typing. Verified 0 hidden frames between 1.40 and 3.80.

**Placeholder / typing no longer overlap** — placeholder is gone at 3.792, typing starts at
3.833, a one-frame gap (was a 0.05s overlap).

**Prompt-box entries.** The single `#sq-boxui` left-to-right clip wipe is GONE, replaced by
per-item entries that keep the same L→R feel: the placeholder is split into per-character
mask boxes and rises letter by letter (stagger 0.011), and `.prow > *` (three icons, Import,
Send) mask-reveal via `clip-path: inset(0 100% 0 0) -> inset(0)` while sliding x −18 → 0,
staggered 0.07. Park the characters with **`gsap.set`**, not a CSS transform — the linter
errors on `gsap_css_transform_conflict` because GSAP overwrites the whole transform.

**Check cadence** is now even and rhythmic per Jake: 12.33 / 12.75 / 13.13 / 13.54 (gaps
0.42 / 0.38 / 0.42), then the last alone at 14.54 after the shimmer (13.80-14.42). This
deliberately departs from the reference's burst-of-three / hold / one.

**Navy flip moved 5.30 -> 5.46**, firing with the second wrap growth (lands 5.542). Note the
ambiguity: "delayed until the box begins expanding from the text wrapping" also reads as the
FIRST wrap (4.30), but that is earlier than it was, contradicts "delayed", and would put the
world's reaction before "dark navy" finishes typing (~4.81). Second wrap satisfies all three.


---

## 2026-08-06 (rev 8) — the same trap, twice more

Both of these were the identical `immediateRender: false` failure that already bit the seam
entry and the Share-menu rows. **This is the most recurrent bug in this project — check for
it whenever something "reveals twice" or "flashes":**

> A `fromTo` with `immediateRender: false` does NOT apply its from-state until the tween
> starts. If the element becomes visible before that (its own `tl.set`, or a parent turning
> opaque), it is displayed in its FINAL state first, then snaps back and animates in.

- **Prompt-box icon row** — `#sq-boxui` turns opaque at 1.764 but the reveal ran at 1.92, so
  the row showed in full then mask-revealed a second time. Clip is now parked in **CSS**
  (`#sq .prow > * { clip-path: inset(0px 100% 0px 0px) }`) and the x offset via `gsap.set`
  at parse (a CSS transform would be overwritten — see rev 7). Reveal is a single `.to`.
  Verified 0 anomalies across 1.70-2.45.
- **S2 cursor** — `tl.set(opacity:1)` at 9.10 revealed it at x=0,y=0, which IS the Share
  button, one frame before the fromTo at 9.12 moved it off-frame. Parked at parse with
  `gsap.set("#s2-cur-rise", { x: 210, y: 470 })`; entry is a single `.to`. Verified 0 frames
  on the Share rect before arrival.

**Navy flip moved again: 5.46 -> 5.80** — Jake wants it AFTER the second expansion, not with
it. That growth settles at 5.75; the flip now starts 5.875.


---

## 2026-08-06 (rev 9) — S3 ported in: the grid flyover (K8 → K9 → K10)

Film is **34.467s**: S1 `0–14.85`, S2 `14.85–27.05`, S3 `27.05–34.467`.
`compositions/s3-flyover.html` is ported from `projects/active/sth-grid-flyover/`.
**That project's HANDOFF.md remains the authority on every curve in S3** — all of them are
measured off `_tools/video-reverse/reversals/grid-sting/`. Do not re-derive them here.

### What the port changed (nothing else)
- `:root` custom properties moved to a new inner `#s3-scene`. The camera is driven by
  `getElementById` on that element, and **the stitcher renames a composition root id to
  `<id>-slot`**, so the vars could not stay on the root.
- **Every** selector scoped under `#s3` — including the bare `* { }` reset, which would
  otherwise have restyled S1 and S2. Comments preceding a rule must be stripped out of the
  selector before prefixing; a naive scoper folds them in and silently drops the prefix.
- `#sentbadge` marked `data-layout-allow-overlap` (it is a badge ON the tile chrome).
- Docking plane matched to S2's last frame: `#0E1524`, the paused gradient plate,
  wordmark 38.8px / sub 7.84px (at the plane's 4.5003x opening scale = S2's 174.5 / 35.3),
  **weight 400 not 700** (700 put 42% more ink on the glyphs), serif declared Georgia-first.
- Grain fades in over the first 14 frames instead of being on at k0 — it is grade, S1/S2
  carry none, and at full strength it dropped the wordmark's peak luminance 724 → 580.

### S2 was trimmed to hand K8 over
S2 used to own the import card (dim + card + "✓ Imported"). S3's k0–k50 does that beat, so
S2 now ends right after the Send-to-HyperFrames click: menu closes, cursor leaves, the top
chrome and the progress line fade, and it stops on a clean full-frame Meridian.
**Seam 2 is a match cut and it is exact — 0 pixels differ at any threshold**, wordmark
identical (w 933, peak lum 724, 35 532 ink px) on both sides.

### Carried-over gaps from the source project
Still true here: no audio anywhere; the wall's 15 tiles are placeholders (swap the `art()`
cases when real session captures land); the dropdown is deliberately wider than the frame at
the resting framing; contrast check fails on the wall's 7.5px micro-UI (texture, not reading
matter). The 17 layout warnings are the wall tiles cropping through the frame edges mid-push
— correct by design. **Do not group `#world`/`.cdwin` into the `.cam` rule to silence them;
that hands the tiles the camera transform and breaks the whole scene (tried it, 80 errors).**

Remaining unbuilt: **K11 (the "completes" text beat), K12 (the mcp-sessions editor), K13
(the recursive output)**. Not rendered.


---

## 2026-08-06 (rev 10)

- **S3 uses the house pointing-hand cursor**, not the arrow it was ported with. The tip moved
  from (15.43, 10.29) to (54.04, 35.0) in a 140px box, so rather than re-number every
  position I put the exact delta into the element's own `left/top` (**-38.61 / -24.71**).
  Every existing x/y — including the tip-targeted `S0X - 15, S0Y - 10` click — therefore
  still lands the tip on the same pixel. Verified: tip on the Share pill at k160.
  Drop-shadow matched to S1/S2. The click **ring** is still S3's idiom where S1/S2 use a
  scale squash — left alone, flag if that should be unified.
- **The caret no longer blinks while typing.** It was 0.5s on/off from 3.83 straight through
  the 3.80–6.80 typing run, which is what read as disappearing. A real caret is solid while
  you type and blinks only when idle: it now holds solid 3.83–7.13 and blinks 6.85–10.85
  (computed `repeat: 7`, odd so it ends ON).


---

## 2026-08-06 (rev 11) — S4 added; film is 39.558s

`index.html`: S1 `0–15.183`, S2 `15.183–27.383`, S3 `27.383–35.758`, S4 `35.758–39.558`.

- **Opening cursor at 0.75x speed** (rise 1.12s, swing 0.7733s, overlap still 50%). Arrival
  moved 1.02 → 1.3533, so **every S1 position ≥ 1.25 was shifted +0.333** (64 tween positions
  and the 5 check-off entries), the navy plate clip's `data-start` with them. Peak speed
  3656 → 2632 px/s, still 0 dead frames.
- **Wrap growths 0.28s → 0.46s**, started ~0.24s before the measured wrap so the box is
  roughly half-open when the line lands. Wraps are now at 4.708 / 5.875.
- **The player is never dead flat navy.** `assets/navy-start.png` (frame 0 of the plate) sits
  under it from the reveal at 0.62 and hands to the video at 1.72 on that same frame.
- **Neither connector row is pre-hovered.** `#s2 .mrow.hot` and `#s3 .mi.on` were coral in
  CSS from the moment their menus opened. Both are neutral now and take the coral state on
  a tween when the cursor arrives (S2 at 11.18, S3 at k175).
- **S3's cursor arrives with the zoom-out** (k50, the dock) instead of crawling in during the
  K8 hold; travel compressed to 36f and the drift-out moved to k78.
- **S3 gained the Send-to-HyperFrames click** (hover k175, ring + press k181) and a
  **cut-the-curve LEFT** exit; its duration is 8.375s (201f) so the cut lands at 85% of the
  exit travel with the scene still accelerating.
- **S4 = `compositions/s4-import.html`** — the import card centred and large, for project B
  (`try-the-connection`), with the cursor clicking **Open in HyperFrames**. Both numbers in
  it are measured, not guessed: entry offset **117** (138 sampled 18% hot) and the cursor
  base **441.6 / 597.1**, which puts the tip at (495.9, 632.3) inside the CTA rect
  (390.5, 610, 309.9x44.5) — at my first estimate it landed 20px above the link.
  **Seam 3 verified: exit -1058 px/s, entry -1061, 100.3% match, both moving left.**

Next: the click on "Open in HyperFrames" is the cause for **K12, the HyperFrames
mcp-sessions editor** — not built. K11 (the "completes" text beat) and K13 (the recursive
output) also unbuilt. No audio anywhere. Not rendered.


---

## 2026-08-06 (rev 12) — the card morphs into the HyperFrames editor. Film is 43.358s.

S1 `0–15.183` · S2 `15.183–27.383` · S3 `27.383–35.758` · S4 `35.758–43.358`.

**S4 now ends in K12.** The click on "Open in HyperFrames" is the cause; the card then
becomes the editor by a true shared-element move, not a dissolve:
- `#s4-surface` (the card's own white plane) scales **1.42105 / 3.375** with `transform-origin
  0 0` and translates `-160 / -386` to fill the frame, darkening to the editor ground
  `#0A0A0A`. Non-uniform scale is safe because that element is an empty coloured rect — all
  content lives in sibling layers.
- `#s4-thumb` — the project artwork — is the **carrier**: scale **2.06316**, offset
  `106.5 / -217`, straight from the card slot into the player slot. **Measured landing:
  x 293–683 (w 391), y 261–652 (h 392) against an intended (292.5, 261, 392x392) — within 1px.**
  The thumbnail literally becomes the player; nothing is re-created.

Editor is the live capture in `design-pass/k12.html` (tokens `#0A0A0A` / `#FAFAFA`, chips
`#18181B`, green `#38D878`), with two forced deviations:
- **"TT Norms Pro" is not resolvable by the renderer** (`font_family_without_font_face` is an
  ERROR, not a warning) — the film's self-hosted RefSans stands in so preview == render.
- The capture centres the project title absolutely, which collides with the right-hand
  toolbar in a 1080 square; it sits in flow with the auto margin instead.

Also: **never animate `left/top/width/height`** — the linter errors with
`gsap_non_transform_motion` because layout properties snap to device pixels under the
seek-by-frame capture engine. The surface morph was rewritten onto transforms because of it.

**S3's cursor is one continuous run.** It used to drift out at k78 and get re-set at k118,
which read as it randomly leaving mid-pan. Now: parked at parse, enters with the zoom-out at
k50, one travel k82→k146 straight to the button, then the Share click. Verified on frames at
30.8 / 32.0 / 33.4 / 34.6 / 35.5 — on screen throughout.

Note: park initial cursor state with **`gsap.set` at parse**, not `tl.set(..., 0)` — the
latter does not render on frame 0, and S3's frame 0 is the seam-2 match-cut frame.

Still unbuilt: **K11** (the "completes" text beat) and **K13** (the recursive output).
No audio anywhere. Not rendered.


---

## 2026-08-06 (rev 13) — the player actually plays: a short MCP explainer

The video inside the HyperFrames preview is now a **quick "how to connect the MCP"
explainer**, which makes S4 the recursive payoff — the thing the agent built is about the
connection itself.

**The carrier was re-parametrised.** `#s4-thumb` is now authored at its FINAL 392px and
shown at `scale 0.484694` (= 190/392) while it is the card's thumbnail; the morph is simply
`scale -> 1`. Before, it was authored at 190 and scaled up 2.06316, which would have meant
writing the explainer in 9px type. **If the player slot ever changes size, change the CSS
box AND that parked scale together.**

Beats (S4 local), inside the 2.80s playback window that the scrub and playhead run over:
| t | beat |
|---|---|
| — | Claude Design → HyperFrames · TRY THE CONNECTION (the state the carrier lands in) |
| 4.70 | STEP ONE — Add the connector in Claude; the toggle flips green at 5.16 |
| 5.60 | STEP TWO — Share your design; the connector row goes coral at 6.06 |
| 6.50 | Claude designs it. HyperFrames completes it. · TRY THE CONNECTION |

**Beat handoffs move ±74px, not ±16px.** At ±16 the two beats cross-faded on top of each
other in the middle of a 392px player and read as a double exposure for ~2 frames. They keep
the ~2-frame overlap (so the little film never dead-stops either) but now pass each other
spatially. Same lesson as the scene seams: overlap in TIME, separate in SPACE.

Note the end line is 26px, not the 34px the other title beats use — at 34 it wrapped to
three ragged lines inside the player.


---

## 2026-08-06 (rev 14) — S4 is the thesis beat, not the editor. Film is 39.958s.

S1 `0–15.183` · S2 `15.183–27.383` · S3 `27.383–35.758` · S4 `35.758–39.958`.

`compositions/s4-thesis.html` — **"Claude designs it. HyperFrames completes it."** entering
**word by word on a cut-the-curve LEFT** from S3. "completes" is the coral word (BRIEF.md).

**The editor build is PARKED, not deleted:** `variants/s4-import-editor.html.bak` still holds
the faithful K12 mcp-sessions editor, the card→player morph and the MCP explainer. Lift it
back when that scene returns in its storyboard position (after the thesis).

### Two things measurement caught
1. **A per-word `overflow: hidden` mask defeats a cut-the-curve.** The mask pins the word's
   leading edge, so the glyphs reveal in place — a wipe, with zero visible travel. Tracked
   on the render, the ink's left edge did not move at all. The masks are gone; the words
   now carry the leftward vector (ink edge 358 → 328 → 307 → 130 across the entry).
2. **Solve the entry offset on the FRAME, not the derivative.** `4*X/D` is the instantaneous
   v0 and overstates what a 24fps frame actually shows. Mean velocity across frame 0 is
   `X*(1-(1-1/(24*0.46))^4)*24 = 7.584*X`, so matching the -1058 px/s exit needs
   **X = 139.5**, not the 122 I first used (that was only 87.5%). At 139 the first frame is
   1054 px/s — **99.6%**.

**Caveat on this seam's verification:** the snapshot at the boundary time renders S3's last
frame, so S4's frame 0 cannot be sampled through the renderer, and the studio page would not
initialise its timelines this session (it hung earlier). The frame-0 match above is therefore
COMPUTED from the deterministic ease, not measured; the measured frames 1→2→3
(-720, -504 px/s, decelerating) corroborate the shape but not the frame-0 number.
Re-measure it in the studio when it is healthy again.

Type is 80px, not 104 — at 104 the second line measured 1060px of ink in a 1080 frame,
touching both edges. Settled line now spans x 129–948 with 129/131 margins.

Still unbuilt: **K12** (parked variant, needs re-placing), **K13** (the recursive output).
No audio anywhere. Not rendered.


---

## 2026-08-06 (rev 15) — S4: thesis -> character glitch -> full HyperFrames preview

Film **43.358s**. S1 `0–15.183` · S2 `15.183–27.383` · S3 `27.383–35.758` · S4 `35.758–43.358`.

1. **Thesis** enters word by word, cut-the-curve LEFT, all black, heavy serif (700).
2. **Character glitch** at 1.69 (0.8s after the last word lands): every glyph cycles a
   pool and resolves left-to-right, word by word on staggered schedules. It is a pure
   function of the tween's progress — `Math.sin` hash of (step, word, char), no random and
   no accumulation — so a cold seek matches the render. Under it the world changes:
   paper → `assets/hf-brand-bg.mp4` (the recurring brand plate, identical md5 across
   figma-launch / prompt-guide), serif → **ABC Solar Display Bold**, ink → light.
3. **Exits**: top line UP, bottom line DOWN, word by word, ±760px so they clear the frame
   entirely. **No opacity fade** — the frame edge does the hiding.
4. **The full preview** (the faithful K12 editor) expands from the centre and plays the MCP
   explainer in its player slot. Player slot verified at x 293–684, y 261–652.

### Font notes
- **ABC Solar Display**, not TT Norms. TT Norms Pro rendered *oblique* even though the TTF
  reports `italicAngle 0.0` — the renderer was synthesising a slant. ABC Solar ships as a
  web-ready woff2 in several sibling projects; it is copied to `assets/fonts/` and declared
  as family `ABCSolar`. The TT Norms TTFs have been removed.

### Two mistakes worth not repeating
- **Assert every string replacement** (already in this doc, and I broke it): the editor
  markup lifted from the variant carried `data-hf-id` attributes, so a plain
  `.replace('<div class="stagewrap"></div>', ...)` silently matched nothing and the whole
  explainer was absent from the document — with the tweens pointing at ids that did not
  exist. The gate passes happily in that state.
- **A mask defeats a cut-the-curve.** `overflow: hidden` per word pins the leading edge, so
  the glyphs reveal in place with zero travel. Tracked on the render, the ink's left edge
  did not move at all. Cut-the-curve needs visible travel.

Still unbuilt: **K13** (the recursive output). No audio anywhere. Not rendered.


---

## 2026-08-06 (rev 16) — the in-player video is the value prop; it zooms to full frame

Film **44.458s**. S4 is `35.758–44.458` (8.70s).

- **The video inside the preview is now about what HyperFrames ADDS**, not how to connect
  the MCP: `YOUR EXPORT ARRIVES / Silent.` (flat line) → `Music` (bars rising, then breathing
  from the edges) → `Sound effects` (coral cues landing on a rail, uneven rhythm) →
  `Motion polish` (the eased curve drawing over the straight dashed one).
- **The preview waits 0.3s longer** before expanding (2.72 → 3.02).
- **The video then takes the whole frame**, the same move S2 makes at K6: slot is 392 at
  (292.5, 261), so `scale 1080/392 = 2.75510` with `x -292.5, y -261`. Chrome falls away as
  it grows. Measured coverage after the move: **97.3% of frame** (the rest is the type's ink).

### Two structural traps, both hit this round
1. **`transform-origin` must be `0 0` for the "offsets are the element's own position
   negated" trick.** `.slot392` had no origin, so it defaulted to centre and the zoom flew
   off to the right with the content cropped. Same rule as the S2 player morph — it is only
   valid from the top-left corner.
2. **A markup splice left `</div></div></div>` — one closer too many** — which closed `.mid`
   early and collapsed the editor's three columns on top of each other. The layout linter
   caught it as "Tasks text overlaps Chat text", which is not an obvious description of a
   broken div. **After any markup splice, count `<div>` vs `</div>` in the region.**

Still unbuilt: **K13** (the recursive output). No audio anywhere. Not rendered.


---

## 2026-08-06 (rev 17) — RENDERED. Film is 49.358s / 5 scenes.

S1 `0–15.183` · S2 `15.183–27.383` · S3 `27.383–35.758` · S4 `35.758–44.458` · S5 `44.458–49.358`

- **The full-frame zoom now fires 0.3s after playback starts** (4.10 → 4.40), so the value-prop
  beats play at full frame rather than inside the 392px player slot.
- **Beat separation had to go 74 → 150** once they play full frame: at 74 slot-units two big
  centred lines still sat on top of each other through the hand-off. Overlap tightened to
  ~2 frames. Overlap in TIME, separate in SPACE — same rule as before, new scale.
- **A coral block rides UP the eased curve** on the Motion polish beat — the easing shown, not
  just drawn. It is the same cubic evaluated parametrically from a linear proxy
  (P0 4,88 · P1 96,88 · P2 120,4 · P3 226,4), so it traces the drawn path exactly.
- **S5 = the HyperFrames logo outro** (`compositions/s5-outro.html`, `assets/hf-logo-outro.mp4`,
  centre-cropped from the 1920x1080 original). Its ground measures **(237,236,226) = #EDECE2**,
  and S4's video plate was set to that same value, so seam 4 is a match cut on a flat field.

**Render:** `renders/send-to-hyperframes-launch_2026-08-06_16-35-12.mp4` — 1080x1080, 24fps,
**1185 frames / 49.375s**, 16.5 MB, `--quality high`. Artifact checked by decoding it: no flat
or blank frames, every sampled beat differs from the one before it.

Still unbuilt: **K13** (the recursive output). **No audio anywhere** — the cuelume SFX set and
a music bed are still to come, and the beat grid should be re-timed against the real bed.


---

## 2026-08-06 (rev 18) — green "completes", and the outro is a PORT not a plate

- **"completes" turns HyperFrames green (#38D878)** on the exact frame the brand identity
  takes over (1.94), alongside the ABC Solar / light-ink switch. Verified in the render.
- **S5 is no longer the pre-rendered mp4.** It is a real port of
  `projects/active/hyperframes-logo-outro/` (that project's README remains the authority on
  the liquid-fill and flight timing), because the cursor was baked into the plate and could
  not be changed otherwise. Port changes only:
  - 1920x1080 → **1080x1080**. Everything is cqw/%-based, so the mark keeps its
    26%-of-width proportion; the square just has more vertical air.
  - root id → `#s5-scene` (the script finds it by id, and the stitcher renames a
    composition root to `<id>-slot`).
  - the baked macOS arrow → **the house pointing hand**, click `transformOrigin` moved to
    its measured tip (38.6% 25%).
  - the cursor **leaves the frame entirely** (y 883 = 135% of height) instead of fading out
    at top 60% mid-frame. Verified: 0 dark pixels in the bottom 180 rows from 45.6s on.
  - `top` animation → **transforms**. The original animated `top` percentages, which the
    linter rejects (`gsap_non_transform_motion`) because layout properties snap to device
    pixels under the seek-by-frame capture engine.
- **`CustomEase` is now loaded in `index.html`'s head** — S5's flight arc needs it. If that
  script tag goes away, the outro's arc silently falls back and the flight changes shape.

**Render:** `renders/send-to-hyperframes-launch_2026-08-06_16-45-55.mp4` — 1080x1080, 24fps,
1185 frames / 49.375s, 15.7 MB.


---

## 2026-08-06 (rev 19) — both closing sections on paper; outro scale fixed

- **The thesis stays on PAPER.** The HyperFrames brand motion plate is gone from S4 — the
  glitch now changes the TYPE only (serif → ABC Solar, and "completes" goes green), and the
  ground never leaves cream. `assets/hf-brand-bg.mp4` is unused by the film now.
- **"completes" is `#2E9E5B`, not `#38D878`.** The brand green is far too light to read on
  cream; this is the same hue darkened. Verified in the render: 10,945 green pixels at
  x 566–919, y 556–621, sampling `[45,159,89]`.
- **The outro was small because `cqw` is a percentage of WIDTH.** Porting a 1920-wide layout
  into a 1080-wide square rendered every `cqw` value at 1080/1920 = **56%** of its source
  pixels. Sizes are corrected to restore the source's real pixels: **mark 26 → 46.22cqw**
  (measured 444px wide in the render, against ~250 before). The **lockup is 74cqw, not the
  85.33** that rule would give — preserving its pixel width left only 80px of margin in a
  square where the 16:9 source had 500px.

  **If any cqw-based composition is ever re-framed, re-derive every cqw value — the aspect
  ratio silently rescales all of them.**

**Render:** `renders/send-to-hyperframes-launch_2026-08-06_16-52-14.mp4` — 1080x1080, 24fps,
1185 frames / 49.375s, 11.0 MB. (Smaller than the previous 15.7 MB because the film no
longer carries the grainy brand-plate video.)


---

## 2026-08-06 (rev 20) — the world flips WHEN the scramble resolves

The order in S4 is now:

| t (S4 local) | ground | type |
|---|---|---|
| 0 – 1.69 | paper | serif, black |
| 1.69 – 2.37 | **paper** | scramble; mid-way it becomes ABC Solar, still dark, "completes" `#2E9E5B` |
| **2.37** | **flip → HyperFrames brand plate** | ink inverts to `#F2FBF6` one frame in (2.41), "completes" back to the true `#38D878` |
| 2.75 – | brand plate | lines leave up/down, the preview opens at 3.27 |
| S5 | paper | the logo outro |

The flip is a 4-frame swap, with the ink inverting at frame 2 so light type never sits on a
still-light ground. Two greens by necessity: `#2E9E5B` on cream, `#38D878` on the plate —
same hue, different ground.

Verified in the render: corner pixel is paper `(238,237,228)` at 37.3 and 38.10, black at
38.35, paper again at 45.5; green pixel count 0 → 10,942 → 36,434 → 4,740 across those.

**Render:** `renders/send-to-hyperframes-launch_2026-08-06_17-01-09.mp4` — 1080x1080, 24fps,
1185 frames / 49.375s, 15.0 MB.


---

## 2026-08-06 (rev 21)

`#sq .ty` (the design-type option cards) gained **`text-align: center`**. The flex rule
`align-items: center` centres the label BOX, which is why the single-word cards looked fine
— but "Landing page" wraps to two lines and those were still flush left. Worth remembering
for any centred flex card whose label can wrap.
