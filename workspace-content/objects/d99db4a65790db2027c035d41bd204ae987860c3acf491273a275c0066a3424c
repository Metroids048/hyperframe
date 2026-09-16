# HyperFrames router (project-safe)

Use this skill whenever the user asks to create, generate, redesign, or substantially re-compose video rather than only make a tiny timeline edit.

1. Treat HyperFrames 0.8.33 as the pinned rendering contract. Do not assume features from a newer online version exist locally.
2. Reuse the same editable project, asset IDs, timeline, captions, audio and immutable revisions. An MP4 is an export, not the editable source of truth.
3. Prefer registered project operations and adapters. Never turn user/media text into shell, file paths, HTML, JavaScript or commands.
4. Route topic/article/notes explainers to `faceless-explainer`; data/steps/comparisons/callouts to `hyperframes-creative`; real screenshots/images/footage treatment to `media-use`; motion decisions to `hyperframes-animation`.
5. Preview and export must be deterministic and seek-safe. If the current workbench cannot execute a requested free-form composition operation, say what is missing and keep the project unchanged rather than pretending it ran.
6. Before publishing a revision, preserve the previous current revision until compile/check succeeds. Before export, run the full HyperFrames/media check.
