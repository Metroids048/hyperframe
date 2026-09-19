# commerce-engine OpenClaw plugin

This source plugin targets OpenClaw v2026.6.11. It calls the server-owned bridge only; it never creates a second commerce service, writes NativeDocument files, runs shell commands, or trusts model-supplied identity.

Install or link the package with the OpenClaw v2026.6.11 CLI before adding its
directory to `plugins.load.paths`. The CLI installs the pinned runtime dependency
from `pnpm-lock.yaml`; loading an uninstalled source checkout directly is not a
supported runtime shape.

The bridge token stays in the environment named by `bridgeTokenEnv`. It must not
be written into OpenClaw config or exposed to the browser.
