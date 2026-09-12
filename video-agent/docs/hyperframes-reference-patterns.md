# HyperFrames reference patterns (LOOP 00)

- Official launch projects use a root composition plus multiple sub-compositions, with DESIGN/STORYBOARD/SCRIPT or HANDOFF documents beside source assets. The launch reference describes a 49.7s project mixing CSS, GSAP, Lottie, shader, Three.js, footage, VO and SFX.
- The official pipeline is capture → design → script/storyboard → voiceover → build → validate; preview and render share the HTML composition runtime.
- Prompting supports cold-start and evidence-backed warm-start workflows, followed by small conversational edits.
- HyperFrames 0.8.33 locally exposes composition routing, GSAP timelines, video/audio elements, deterministic preview/render, lint/check/validate, inspect, keyframes and snapshot. CLI help also exposes media/audio tooling.
- `data-composition-src` is the supported sub-composition mount; each composition registers one paused GSAP root timeline. Timed media remains editable source media.
- Lottie, shader and Three.js are not first-class dedicated CLI commands in 0.8.33; they can only be treated as custom native HTML/runtime content and require a real project probe before claiming support.

Sources: official Prompt Guide (https://hyperframes.heygen.com/guides/prompting), Launch Videos (https://hyperframes.heygen.com/launch-videos), Pipeline (https://hyperframes.heygen.com/guides/pipeline), Website to Video (https://hyperframes.heygen.com/guides/website-to-video). Local evidence is the pinned CLI help and `config/skills/upstream/hyperframes-core/SKILL.source.md`.
