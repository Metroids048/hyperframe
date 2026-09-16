# HeyGen launch-video templates

Four finished motion-graphics projects you can re-brand by asking an agent to.

Each one is a single `index.html` — no build step, no framework, no sub-compositions.
Download the folder you want, open it with your coding agent, and say:

> *"turn this into a video for Figma."*

That's the whole instruction. Everything the agent needs — what to change, what to leave
alone, how to fetch the brand's real assets, and how to check its own work — is written into
each project's `README.md`, for the agent rather than for you.

Rendered videos are not committed to this repo. Run `npm run render` in any project to produce
`renders/*.mp4` locally; `hero/` builds the 54.2s compilation of all four.

## The templates

| | template | what it is | canvas |
|---|---|---|---|
| 01 | [`01-ui-sting`](01-ui-sting) | Sign-in card → a counter → a nav → a click → a menu → an endcard. The most structured of the four, and the easiest to map onto any product. | 720² · 10.8s |
| 02 | [`02-bouncy-ui`](02-bouncy-ui) | A prompt is typed and generated; the result arrives as UI that flips, threads and closes on a text selection. Springy, 3D, drop shadows. | 1080² · 12.1s |
| 03 | [`03-message-sting`](03-message-sting) | Tiles flip into a chat, a request is sent, a card is grabbed and docked, a store listing grows, status rows conveyor past. | 720² · 12.8s |
| 04 | [`04-generate-reel`](04-generate-reel) | A phrase is selected like text and submitted; a glass panel fills with progress; results arrive as a folder that gets pulled out and whipped off frame. | 720×1280 · 11.8s |

`hero/` is the compilation above — all four templates end to end with a title card in front of
each, 54.2s. It's also a working project if you want to build your own sizzle from re-branded
clips: drop your renders into `hero/assets/clips/` and adjust the frame windows at the bottom
of `hero/index.html`.

## What a re-brand actually involves

The agent is told to do three things.

**Capture the brand instead of guessing it.**

```bash
npx hyperframes@latest capture https://<their-site> --json
```

That writes a `./capture/` directory with real logo SVGs, colour values and font references.

**Write their story into the beats.** Each template's beats are slots, not fixed screens —
a lockup, an entry surface, a number that matters, a nav, an action taken. The agent maps the
product's own surfaces onto them. Getting that mapping right is most of what separates a
re-brand from a recolour.

**Keep the motion.** Every frame number, easing function and cut is deliberate. Each project
ships a `ledger.json` describing what each cut has to satisfy, so the agent can check its work
instead of guessing.

## What makes them feel expensive

Two decisions, applied everywhere, and both are worth stealing even if you never use these
files:

**One ease family.** Everything arriving uses the same curve; everything leaving uses its
mirror. Nothing overshoots, nothing is linear, nothing bounces on a stock `elastic`. Because
it is one family, moves that were never individually tuned still look like they belong.

**Matched vectors at every cut.** No scene settles before its cut and none starts from rest
after one. The outgoing element is still travelling when the frame changes, and the incoming
one enters already in flight on the same axis, in the same direction. That single rule is why
these read as one continuous camera move instead of a stack of scenes.

## Examples

[`examples/`](examples) holds two finished re-brands of template 01, produced exactly the way
described above — one prompt plus a few brand notes:

- [`examples/instagram`](examples/instagram) — light, `#0095F6`, Reels-shaped content, and
  Instagram's own outlined **+** button in place of the labelled pill.
- [`examples/spotify`](examples/spotify) — dark, `#1DB954`, listening minutes, a library nav.

They're useful to read next to `01-ui-sting`: the motion is identical in all three, so the
diff is purely the brand layer.

## Running any of them

```bash
npm run check     # lint + runtime + layout + motion + contrast
npm run dev       # preview in the browser
npm run render    # -> renders/*.mp4
```

## Before you publish anything from here

- **Fonts.** `01`, `04` and `hero` ship **TT Norms Pro**, a commercially licensed face. A
  licence to use it does not automatically cover redistributing the files. Confirm yours
  covers it, or delete `assets/fonts/` and the `@font-face` blocks — the stack falls back
  cleanly and the layout holds, because nothing measures text at runtime. `02`, `03` and both
  examples use open faces (Inter / Figtree, SIL OFL).
- **Footage.** `04` uses product demo clips featuring identifiable people. Swap them for your
  own before publishing.
- **Trademarks.** The marks in `examples/` are simplified redraws, not official assets, and
  those examples aren't affiliated with or endorsed by the brands they depict.
- **Audio.** Everything here ships silent. Add a bed as a clip on its own track — it needs an
  `id`, or it renders silent.
