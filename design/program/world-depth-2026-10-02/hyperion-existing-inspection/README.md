# Hyperion Caved Shaft: existing-asset inspection

**Existing exported geometry only. Scalar PBR materials retained; Basis texture detail omitted for offline Blender compatibility. These are not new models, proposed-geometry renders, gameplay-camera captures, or live visual acceptance.**

## Finding
The existing dead hulk is an elongated wrecked ship, the powered drill has an intact upright derrick, and the cold drill has a sealed house and stowed bit. Cold is structurally distinct, not a recolor. The seamed asteroid is a closed rock with an exterior luminous seam, not a hollow excavated mouth. Exact exported LOD0 triangle counts: hulk 9,684; powered drill 7,068; cold drill 1,688; seamed asteroid 7,494.

Hyperion already has a separate Half-Cut at (-60,60), composing cold drill, seamed rock, crusher and extraction mast. A repeated drill cluster at the Caved Shaft would duplicate that identity.

## Proposed missing geometry, not yet built
Prioritize one collapsed-mouth landmark at the existing poi_hyperion_driller position (240,-1180). Reuse the powered drill's industrial components/design. Repose its derrick into an excavated mouth and give one folded auger/tooth a readable silhouette. The genuinely missing component is an open cavity with a recessed amber-lit wall. Do not explain the light or add a mission, reward or machinery behavior. Preserve the cavity's negative space in the measured collision skin.

## Exact owner carve-out required before production work
Public master 250b53e579979599238144fbb6b27d43a5a0d0aa still lists L-PICTURE as claimed by devin-graphics. Sector-identity is free but explicitly requires graphics coordination. C6 guidance ownership does not cover geometry. Allocate one C6 landmark-only carve-out with the graphics owner:
- New tools/blender/forge/ships/place_caved_shaft.py and only its tools/blender/forge/fleet.json entry; existing drill builder remains unchanged.
- New place_caved_shaft source/release GLBs and caved-shaft render package, through established tooling.
- Only corresponding rows in assets/ships/parts/parts_manifest.json, assets/ships/release/release_manifest.json, assets/ships/render-packages/pilots.json, src/render/renderPackageManifest.js, src/render/partsLibrary.js and model-truth census/generated data. Serialize these shared generated files with current owners.
- Only poi_hyperion_driller visual identity and explicit sizing in src/data/frontierRegions/west.js; a dedicated test/caved-shaft-visual-placement.test.mjs.
- No global world renderer changes, mission/journal edits, Half-Cut changes, or neighboring site changes. Do not treat an absent heartbeat as owner release.

## Scale and collision evidence
Measured plans from the inspected checkout: hulk radius 42 yields draw scale 1 and silhouette radius 27.783 WU. Drill models are absent from world.js DRESSING_RADIUS, so a naive landmark swap uses radius 24: powered silhouette 12.303 WU at scale 1.091; cold 21.053 WU at scale 3. Both have adopted skins. The renderer POI resolver and solidDressingPlanFor both support explicit target sizing against the longest bounds axis. A tentative placeTargetRadius 28 would fit a 56-WU longest envelope, close to the current hulk's 55.2-WU length. This is a starting constraint, not an accepted collision route. Measure the new composite, verify the cavity opening and approach, and perform gameplay-camera review before acceptance.

## Bounded official bank comparison
- [Kenney Space Kit](https://kenney.nl/assets/space-kit): official page lists 150 3D files and CC0. Useful modular silhouette reference; not evidence of this specific collapsed excavated site.
- [Quaternius Ultimate Space Kit](https://quaternius.com/packs/ultimatespacekit.html): official page lists 92 models, FBX/OBJ/Blend/glTF and CC0, spanning broad space-game categories. Breadth does not close this particular damaged machinery-to-geology interface gap.
No packs downloaded or licenses accepted. More generic drills, ships and pipe racks are not the needed increment.

## Reproduce the inspection
Inputs are the exact public Git blobs in exact-package-provenance.json, under assets/ships/release/render-packages/<name>/render.glb. No source GLBs are duplicated here. Use an existing checkout containing those objects; recover-existing.sh fails rather than fetching missing objects. Set REPO and an absolute INSPECTION_DIR, then run the recovery script. Verify each recovered SHA-256 against the receipt before decoding.

Use the repository's installed @gltf-transform/core, @gltf-transform/extensions and meshoptimizer packages; place decode-existing.mjs where Node can resolve those existing dependencies (an isolated directory with a node_modules link is sufficient). Run node decode-existing.mjs, then blender -b -t 2 --python render-existing.py, then python compose-existing.py. Blender inspected version was 4.3.2; Python needs Pillow. All outputs go only to INSPECTION_DIR. The decoder preserves mesh geometry and scalar material factors but removes Basis textures from its diagnostic copies. Render excludes collision and LOD1/LOD2 meshes, uses 16-sample Cycles without denoising, and a common 65-unit orthographic scale. Per-view centering differs; raw authored scale is retained.

## Inspection limitations and failed paths
The connector's binary-blob text retrieval failed with UnicodeDecodeError; exact local Git objects supplied all four packages instead. Blender import rejected EXT_meshopt_compression; the installed decoder resolved geometry without production changes. The first Cycles run failed because OpenImageDenoise is unavailable; disabling denoising resolved it. No live browser or gameplay review was attempted. Basis texture omission means surface finish is not accepted by these images. No new geometry or production edits were made.

Evidence date: 2026-10-22. Public ownership sources: [build_map](https://github.com/coldshalamov/SpaceFace/blob/250b53e579979599238144fbb6b27d43a5a0d0aa/build_map.md) and [NOW](https://github.com/coldshalamov/SpaceFace/blob/250b53e579979599238144fbb6b27d43a5a0d0aa/design/program/NOW.md).
