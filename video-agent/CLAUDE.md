# Claude Workbench Bootstrap

Before doing any work in this project, run `node scripts/workspace-context.mjs --fetch-soft`, then read `outputs/workspace-context.json`, `prompts/workbench-agent.md`, and `AGENTS.md` in that order.

`prompts/workbench-agent.md` is the canonical GitHub + local fusion policy: local files are the execution source, uncommitted work must never be discarded, `origin/main` is the upstream reference, and HyperFrames remains pinned at 0.8.33 unless an explicit separately-tested upgrade is requested.

After that bootstrap, follow every HyperFrames composition rule in `AGENTS.md` and load the relevant project skills from `config/skills/registry.json` before editing. Do not use generated `outputs/` as source code. Do not force-push `main`.
