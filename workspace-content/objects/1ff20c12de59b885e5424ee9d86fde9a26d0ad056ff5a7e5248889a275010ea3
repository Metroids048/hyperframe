# Pinned reference sources

Runtime stays at HyperFrames 0.8.33. The Git links and `.gitmodules` restore:

- `hyperframes`: `6e3308be4f2ab886597fcee7c5896a5f842ec4b6`
- `hyperframes-launches`: `6259ea7aa45042fa6ebf941538cf7621cf6dad0f`

New production uses `third_party/hyperframes` for both CapabilityCatalog and
full discovery. `video-agent/config/hyperframes/catalog.generated.json` records
the content hashes. Required resources fail closed when read; unused optional
shaders do not break imports. Launch examples are reference-only; LFS pointers
are not playable assets.

The older `video-agent/config/hyperframes/ea7e...` snapshot and repository-level
`hyperframes/` download are retained as historical user files. They are not
fallback execution roots. Existing project resource locks keep their own hashes.

For a fresh checkout: `git -c core.autocrlf=false submodule update --init --recursive`.
No credentials belong in these mirrors or committed configuration.
