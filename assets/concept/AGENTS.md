# assets/concept/ — Reference Art (NOT Runtime)

**REFERENCE ONLY.** Nothing here is loaded by the game. Mood for Blender/portrait authoring only.

- Machine index: `assets/concept/index.json`.
- Pipeline: `design/world-identity/PIPELINE.md`.
- Graphics route: `docs/visual-assets/README.md`; imagegen handoffs in
  `docs/visual-assets/AGENT_PROMPTS.md` §§ E–F.

Do not add `assets/concept/` paths to `src/` (`check-asset-reachability` will flag NOT BUNDLED).
Do not substitute a concept JPG for a missing GLB. Read `index.json` before authoring a new
`place_*` or hull. Copy the *look* into live folders (`ships/parts/`, `portraits/`). Record prompt,
hashes, tool/model, selected/rejected traits, and license for generated references.

Promotion: concept → Blender export → `assets/ships/parts/` → finalize → release build →
`parts_manifest.json` + `partsLibrary.js`. `index.json` does not prove the target is built.
