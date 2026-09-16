# HyperFrames animation guidance

Use for motion, entrances/exits, transitions, zooms, reveals and GSAP-related composition decisions.

- Animation must be deterministic at any seek position. No `Math.random()`, `Date.now()`, asynchronous timeline construction or infinite repeat.
- Build the final/hero layout first, then animate into and out of that layout. Do not use motion to hide a broken static layout.
- Keep one paused root timeline per composition in the HyperFrames contract; the player owns playback and seeking.
- Use finite, purposeful motion. Do not add a transition simply because a scene boundary exists.
- A transition must connect adjacent clips and use the same overlap duration recorded in the project timeline.
- Do not animate media playback itself or issue play/pause commands. Video/audio synchronization remains owned by the framework.
