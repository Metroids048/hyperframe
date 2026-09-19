# Rollback runbook

Until M7, keep COMMERCE_AGENT_RUNTIME=legacy (the default). Rollback is a routing/config change, not a data restore: preserve any OpenClaw-created revisions and jobs, stop new OpenClaw submissions, and let the existing service resume from persisted checkpoints. Never overwrite data/commerce-runs with an old snapshot and never replay an unknown-charge request.

Local routing rehearsal passed: openclaw fails closed without credentials; shadow compares control decisions without write authorization while production stays on the legacy provider, and an explicit switch to legacy restores the existing provider path without starting a media job. A real Gateway-backed persisted job rollback remains blocked and is required before M7 cutover.
