# Pip & Spanner: integrated maker handoff

SF20-19 now has editable Forge models and an existing-screen consumer in the Crucible pre-run and milestone armory. Pip indicates the current equipment; Spanner responds to accepted fitting/repair receipts. The selected item, installed component and last receipt remain distinct facts. Current source and local checks are complete for this maker increment; final browser/GPU/visual acceptance and PR publication remain open.

## Actual files

- Recipe: `tools/blender/forge/ships/pip_spanner.py`
- Editable model, source alternatives, motion proposal and source renders: `tools/blender/forge/source_assets/pip_spanner/`
- Source GLB: `assets/ships/parts/places/place_pip_spanner.glb`, SHA256 `32b9d623fd8f9166109b5b4690ccf7712d90d5d3dde25a14a61329daa0d7c2cd`,1,140,560 bytes
- Compressed release: `assets/ships/release/parts/places/place_pip_spanner.glb`, SHA256 `247a57ec9b5d9066b79c9d0f09d3197fd45c51c47ec469af988ad11cfd6245f0`,422,152 bytes
- Actual package loaded: `assets/ships/release/render-packages/pip-spanner/`, render GLB743,632 bytes, SHA256 `1f9f4165e1639c856f9ee09d6df7cc5cd52ea7f99617337990c509913d2485f5`
- UI: `src/ui/orrery/pipSpannerCrew.js`, `pipSpannerPreview.js`, existing armory/layout and `src/ui/screens/crucibleDraft.js`
- Purchase/repair authority: `src/systems/survivalDraft.js`; two optional transaction-ID echoes in `runSession.js`. The current composed run-lifetime helper in `src/core/runState.js` is included as an existing prerequisite, preserving its original behavior
- Three focused `test/pip-spanner-*.test.mjs` tests and the existing Crucible visual-preparation checks

The canonical registration generator appended exactly one pilot while preserving295 existing rows/bindings. The selected package builder rebuilt only Pip; its296-package summary is the complete manifest count. The generated runtime manifest also preserves the previously composed package hashes, which differed from the older local HEAD. This is a current-composition increment; reconcile against the live PR before publication, never overwrite another writer's tree.

## Checks and limits

Root passed66 integrated interaction cases,15 source/test syntax checks, the selected deterministic package rebuild, the actual public lease check and the portable Mite20 consumer regression on a fresh1,033-module cohort `8d1cc75935b61624a96fdf0cec708022e428f7637381312b5d13f2384d0aad55`. The decoder's150 tests remain a separate scope. Existing CRLF in runSession is preserved; whitespace checks pass with CRLF-aware settings.

The public route is real lease → normal loader → generated package → integrity validation → compiled runtime-table binding → preview construction. The isolated test replaces browser-only KTX2Loader with real Basis CPU mip decoding and uses a renderer double. It verifies25 primitives, six pivots,16,920 oriented triangles, native-size cradle projection, accepted/repair/denied poses, close/reopen, and logical cancellation retaining actual decode ownership. Integrity adversaries reject corrupt metadata and render bytes. It cannot certify browser Worker scheduling, WebGL uploads/shaders, actual screen pixels or frame time.

Only one source tier is selected. Lower source alternatives are preserved, not advertised as active adaptive LODs. There are seven materials and25 primitives; the package stores16,353 positions after legal welding versus16,364 in the release reference. Surface parity error is below0.0000004m. These counts/file sizes are not GPU costs. No world actor, collision body, new texture family or global material/motion registry was added.

## Reproduce from repo root

```sh
node --test test/pip-spanner-ui.test.mjs test/pip-spanner-screen-route.test.mjs test/pip-spanner-purchase-receipts.test.mjs test/crucible-visual-preparation.test.mjs
node scripts/generate-render-package-pilots.mjs --check
node scripts/build-render-package-pilots.mjs --check --only=pip-spanner
PIP_GAME_ROOT="$PWD" node --loader ./design/visual-assets/pip-spanner/checks/cpu-decoder-loader.mjs ./design/visual-assets/pip-spanner/checks/check-public-lease.mjs "$PWD"
PIP_GAME_ROOT="$PWD" PIP_NEGATIVE_CASE=runtime node --loader ./design/visual-assets/pip-spanner/checks/cpu-decoder-loader.mjs ./design/visual-assets/pip-spanner/checks/public-package-negative.mjs "$PWD"
PIP_GAME_ROOT="$PWD" PIP_NEGATIVE_CASE=render node --loader ./design/visual-assets/pip-spanner/checks/cpu-decoder-loader.mjs ./design/visual-assets/pip-spanner/checks/public-package-negative.mjs "$PWD"
```

## Reviewer handoff

Read [attempts and reasons](ATTEMPTS.md), the interaction/lifetime/root-contract reviews and [public-route review](PUBLIC_PACKAGE_REVIEW.md). Check the existing pre-run and milestone screens using real inputs at small and large sizes: current item in the cradle, legible cost/benefit, refusal and successful receipt, repair, repeated purchase, launch, close/reopen and delayed load. Judge the two bodies' form/materials at their actual screen footprint and measure target-device costs. Keep existing wallet/fitting authority and all ownership fixes. Final acceptance belongs to the existing SF20-19 local-primary reviewer; its phase/owner/completion fields are unchanged.

Original failed root-contract candidate and exact failure are preserved under history/. It is not a runtime source. Current images are Blender source previews and do not establish composed-screen acceptance.
