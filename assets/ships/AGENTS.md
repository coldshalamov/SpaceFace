# assets/ships/ agent notes

Ship/place authoring inputs, release outputs and the manifests that bridge them to runtime. Exact
machine records (`parts/parts_manifest.json`, `release/release_manifest.json`,
`render-packages/pilots.json`, the maps in `src/render/partsLibrary.js`) outrank prose inventories.

## Ship bodies: Forge only

Every whole-ship body — player, NPC, traffic, faction variant — is built and published with
[`tools/blender/forge/FORGE.md`](../../tools/blender/forge/FORGE.md):

```
blender -b --python tools/blender/forge/ships/<ship>.py        # preview into assets/ships/forge/preview/
node scripts/fleet-look.mjs --file=assets/ships/forge/preview/<file>.glb --views=inspect,close,top
node tools/blender/forge/publish.mjs <ship>                     # parts GLB -> manifest sync -> release -> package -> census
```

`tools/blender/forge/fleet.json` names the live file each forge ship replaces. Publish runs the repo's
own release tools for exactly that ship. Commit the ship file, the three (or one) GLBs, and the
regenerated manifest/package/census rows together with pathspecs.

Do not hand-edit a GLB, do not add per-ship baked texture sets, do not wire a body that has not been
looked at in `fleet-look` at chase/close zoom.

## The pipeline, for when something breaks

1. Source: `parts/wholeships/<file>.glb` (player families: `<file>`, `_lod1`, `_lod2`; NPC bodies: one
   file with `LOD0_/LOD1_/LOD2_` meshes).
2. `node scripts/check-parts-manifest.mjs --sync` refreshes bytes/tris/bounds/sockets rows.
3. `node scripts/build-sg04-release-assets.mjs --no-clean --only wholeship_<file>[,...]` writes the
   release copy (KTX2 + meshopt) and its release-manifest row.
4. `node scripts/refresh-render-package-pilots.mjs --only=<key>` then
   `node scripts/build-render-package-pilots.mjs --only=<key>` rebuild the render package the game
   actually loads (`src/render/renderPackageManifest.js` is generated).
5. `node scripts/model-truth-census.mjs` then `node scripts/lib/splice-census-rows.mjs --match=/<file>.glb`
   keeps the census change to the rows on that model (the full regeneration churns float noise).

The identity (`spacefaceAsset.assetId`) must equal the pilot's `runtimeAssetId` and the partsLibrary
maps. Never edit generated release metadata by hand or weaken a check to ship a body; if a check
pins an old body (triangle bands, material names), update the pin to the new body in the same commit
and say so.

## Places, stations, props

Existing builders stay until Forge covers them. Hold them to the FORGE.md look bar and review them
with `scripts/fleet-look.mjs --files=places/<file>.glb`.
