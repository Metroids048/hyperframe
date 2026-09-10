# Repository Workbench Bootstrap

For any work in `video-agent/`, first switch to that directory and run `node scripts/workspace-context.mjs --fetch-soft`. Then read `outputs/workspace-context.json`, `prompts/workbench-agent.md`, and `AGENTS.md` before changing files or invoking the video Agent.

The canonical fusion rule is: current local files are the execution source; `origin/main` is upstream reference; never discard uncommitted local work; never force-push `main`; generated outputs/caches are evidence, not source. HyperFrames is pinned to 0.8.33 unless an explicit upgrade is separately tested.
