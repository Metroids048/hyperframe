# Version compatibility

| Component | Required/observed | Evidence | Status |
|---|---|---|---|
| OpenClaw | v2026.6.11 exact | evidence/openclaw-package-v2026.6.11.json; registry metadata and isolated tarball | pass |
| Node.js | >=22.19.0 for target | outputs/workspace-context.json, Node v24.19.0 | pass |
| HyperFrames | 0.8.33 pinned | video-agent/package.json and workspace context | pass |
| package manager | required to install target Gateway/plugin | npm absent from shell; isolated pnpm 11.19.0 install and locked plugin dependency succeeded | pass_with_path_limitation |
| Chromium | browser verification | Google Chrome 153.0.8010.37; existing application browser regression passed | pass_local; OpenClaw UI gate still blocked |
| FFmpeg / ffprobe | media checks | project optional dependencies: FFmpeg 4.4, ffprobe 4.4.1 | pass_local |
| fonts | render inventory | 369 local font files observed | inventory_only |

No latest package, short 6.11 alias, or unverified install channel was used. The target package and plugin dependencies were installed only in isolated temporary locations, not into the application dependency tree.
