# Authoring bank integration boundary

Configuration and loader review on 2026-10-14 used upstream master
`68ace4033de41dbe3887ecf2789dfba3c39c0715`.

The bank is available to authors and other implementation agents. Adding its files
alone does not register gameplay objects or preload the bank.

## Verified ownership

- `src/render/partsLibrary.js` uses explicit `assets/ships/parts` and
  `assets/ships/release/parts` roots and slot catalogs. Bootstrap/entity plans
  choose filenames; it does not scan `assets/models/asset-bank`.
- `src/render/assetLoader.js` preloads supplied authored-part requests.
- `src/render/renderPackageManifest.js` contains explicit source/ID mappings.
- `scripts/lib/releasePackaging.mjs` has a release-copy allowlist that excludes
  `assets/models`. `scripts/build-bundle.mjs` uses that list.
- `vercel.json` deploys `build/web`; Electron packaging also selects `build/web`.
- Source-server access serves explicitly requested files. Its freshness scan in
  `scripts/lib/gameServer.cjs` excludes asset trees.

Consequently, a consumer must explicitly register and package selected assets.
Do not add the entire bank to a preload list or retail-copy allowlist merely to
make one piece appear. Repository clone/source-storage and transfer costs do
increase. The existing Vercel ignore-build script allows master/main builds by
branch, so an authoring-only merge can still trigger a build.

## Consumer checklist

1. Use `list-asset-bank.mjs` to select a published ID, confirm materials, dimensions,
   pivot, sockets, LOD costs and intended interaction.
2. Use `plan-asset-bank-scene.mjs` for explicit transforms and conservative bounds.
   It supplies authoring estimates, not batching or frame-time predictions.
3. For composition recipes, run `check-asset-bank-assemblies.mjs` against the exact
   selected bank. Hash locks must match actual referenced bytes.
4. Coordinate the existing feature/runtime owner before adding the selected IDs
   to its registry, finite asset residency and release package.
5. Verify actual game-camera readability, collisions and motion clearance,
   loading/Continue behavior and target-device performance. Reuse the relevant
   feature harness; a CPU export image is not runtime acceptance.
6. Record exported, reviewed, published, integrated and accepted states separately.

This review is source/configuration evidence, not a running deployment capture.
Recheck these paths when upstream changes before making integration assumptions.
