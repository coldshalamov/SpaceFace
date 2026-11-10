# SF20-19 Pip & Spanner, root-contract successor v2

An original precision-optic drone and open-center two-claw service sled for the existing armory preview. This packet contains no world spawn, collision, economy, save state, global material change, fleet entry or runtime consumer.

## V2 source-only correction

V1 remains sealed and unchanged. The current selected-place builder rejected its missing canonical-root contract; the exact failure log is `evidence/v1-selected-release-build-failure.log`. V2 adds the identical full `spacefaceAsset` contract to the actual `SF20_19_PREVIEW_ROOT` and adds `exportedLods:["lod0"]` plus `deliverableRole:"production_single_lod_preview"` at asset, scene and root. Numeric source-tier `lod` remains 0/1/2 respectively. Each alternate remains a standalone one-tier file with LOD0 primitive names.

The corrected recipe emits all three contract locations and stores the default LOD0 contract on the editable Blender scene/root. Its actual stamp function was compiled from the recipe AST and reproduces each exact delivered GLB from the original JSON and BIN bytes. `evidence/glb-metadata-parity.json` proves all non-contract JSON and complete BIN payload/padding identical. `evidence/blend-metadata-parity.json` proves save/reopen identity of meshes, UVs, material nodes, packed image bytes, object transforms/parents, actions and authoring camera/lights. Existing v1 art screenshots are retained because the rendering content is byte-identical; no new visual approval is claimed.

No shared source, validator, manifest or release builder was changed or run. The integration owner performs the serial selected-place release retry.

## Files and reproduction

- `pip_spanner.py`: editable declarative Forge recipe. Uses the supplied exact `forge/` snapshot, or the parent Forge directory when placed in the game's `tools/blender/forge/ships/` directory
- `pip_spanner.blend`: 58 named source components, all six editable semantic pivot empties, packed shared textures, authoring camera/lights, receipt-confirm action at frames 0–39 at 60 fps. Source parts remain individually editable; the exported welds do not replace them
- `pip_spanner.glb`: one complete LOD0 pair, no duplicated lower tiers, animation, collision, camera or light
- `pip_spanner_lod1.glb` / `pip_spanner_lod2.glb`: separate alternate tier files, never add them alongside LOD0. The separate-file contract uses `LOD0_<SEMANTIC>__<material>` in every file; the asset metadata identifies the source tier
- `pip_spanner.motion.json`: bounded preview pose proposals in glTF coordinates; it is deliberately not a global simulation motion-bank registration
- `measured-contract.json`: exact exported triangles/primitives/bytes/hashes, pivots, source bounds
- `provenance.json`: original-reference identity and exact Forge snapshot hashes
- `evidence/`: author-size screenshots and offline production-loader check, explicitly labeled by scope

Build with Blender 4.3.2:

    blender -b --python pip_spanner.py -- --out <packet-directory> --render
    blender -b --python render_review.py
    blender -b --python render_working.py
    blender -b --python render_lods.py
    node verify_contract.mjs <game-repository-root>

`forge.py`, `forge_export.py`, `motion.py` and six texture source files are unmodified existing Forge modules, included only to make this small packet reproducible without a checkout. No alternative material system is introduced. The builder uses Forge plates/section shoulders, real geometry bands, inset panels, supported beams, sweep arms, bearing cylinders, ring shrouds, standard finishing and the same material-per-rigid-group welding operation used by the shipping exporter.

## Coordinate and semantic contract

Authoring: metres, +X nose, +Y port, +Z up. glTF: metres, +X nose, +Y up, +Z starboard. Convert source `(x,y,z)` to glTF `(x,z,-y)`. Root scale is one. No entity-radius normalization is appropriate for this UI prop.

`SF20_19_PREVIEW_ROOT` contains independent `SPANNER_ROOT` and `PIP_ROOT`. The former contains `CLAW_L`, `CLAW_R`, `ITEM_CRADLE`; the latter contains `PIP_POINTER`. Exact empty names are retained. Each carries `spacefaceSocket:true` so the current lease's flattened marker collector retains it, plus `spacefaceInstance:false`. These are preview transform anchors, never collision or world sockets.

Mesh names are `LOD0_<SEMANTIC>__<finish>`; use the longest matching semantic token and the exact marker matrix when reconstructing rigid groups from the flattened blueprint. Primitive matrices are already scene-relative. Place a primitive under its owner using inverse(owner world matrix) times primitive world matrix; do not add the marker translation a second time. The pointer marker is nested under Pip, while the loader's marker matrix is scene-relative.

Neutral glTF world pivots:

- SPANNER_ROOT: `(0,0,0)`
- CLAW_L: `(1.62,0.30,-3.60)`
- CLAW_R: `(1.62,0.30,3.60)`
- ITEM_CRADLE: `(1.25,0.80,0)`
- PIP_ROOT: `(-8.40,1.90,-4.40)`
- PIP_POINTER: `(-7.90,1.78,-3.61)`; local to Pip `(0.50,-0.12,0.79)`

The selected equipment visual belongs at ITEM_CRADLE, with a visible truthful label in the consumer. The crew contains no counterfeit module. Cradle brackets are visibly connected to the bay rails.

Jaws rotate about local glTF Y. The receipt-confirm maximum is L=-0.17 radians, R=+0.17. Underlying bearing axles/caps remain stationary while the jaw casting rotates under them. Pointer rotation also uses local Y. Preview focus moves Pip by no more than `(0.38,0.12,0.20)` metres before projection; additionally clamp consumer screen travel to 30 px. Reduced motion/skip must resolve instantly; visual motion never delays or decides the accepted transaction.

## Composition and authored pixel review

The pair was first reviewed against the original concept pixels and existing Latch-Nine Forge chase/close references. An initial rounded rear frame was revised after review: rear bridge and side load-bearing members now use planar cast sections, explicit chamfer shoulders, dark assembly joints and larger panel spacing. Only grip/cradle pads read soft. No new noise or unique high-resolution texture was added.

For the exact 360×216 and 250×190 author-size compositions:

- glTF camera position `(-1.8,33,19)`, target `(-1.8,0.7,-1)`
- Orthographic horizontal width 20.5 metres; Three left/right = ±10.25, top/bottom = ±10.25 / aspect
- ITEM_CRADLE projects to `(233.561,122.006)` at 360×216 and `(162.195,104.726)` at 250×190
- Neutral, maximum jaw close and working-pointer native-size images are in `evidence/author-*`
- `evidence/camera-contract.json` records each camera, output size and projected anchor
- The square optic, fan neck/hub, solid pointer, two independent bodies, central rectangular worklight, open bay and pivot support remain legible in these author-size images

All screenshots in this packet are Blender authoring evidence, including the actual-exported-GLB LOD inspection. None is labeled or offered as real armory acceptance. The normal-route UI, item overlay, labels, occlusion and final material response need the real consumer's picture.

## Actual exported costs and limitations

Measured from the generated GLB accessors:

| Tier | Triangles | Draw primitives | Materials | Embedded images | Bytes |
|---|---:|---:|---:|---:|---:|
| LOD0 | 16,920 | 25 | 7 | 6 | 1,140,560 |
| LOD1 | 6,766 | 25 | 7 | 6 | 664,924 |
| LOD2 | 3,042 | 25 | 7 | 6 | 498,572 |

The byte counts above include the v2 metadata-only additions; geometry counts are unchanged.

25 is the unbatched body primitive count, not an observed frame draw count and not the concept's proposed ten-draw target. Separate independently moving groups require separate material welds. Measure the single visible crew pair with the actual item/UI/post path before accepting performance; no arbitrary triangle cap was used as a substitute.

There are zero newly authored texture files; six existing Forge texture sources are reused: three existing 1024² Forge panel maps and three existing 512² Forge machinery maps. They are embedded once each per GLB. This does not guarantee cross-file GPU deduplication. Uncompressed RGBA8-equivalent texture storage is approximately 15 MiB base / 20 MiB with full mips before renderer-specific behavior; release compression can reuse the game's normal shared-image pipeline. This is an estimate, not a GPU-memory measurement.

Material roles are the unchanged Forge vocabulary: Hull (cream), Armor (mid), Accent (teal), Mechanical/MechanicalDark, Emissive_Cyan (Pip optic) and Emissive_Warm (Spanner worklight). They retain `spacefaceFinish:forge-v1` and `spacefaceMaterialRole`; source finishes and factors are in the GLB. No transparent surfaces, fake atmosphere plane or extra shadow material.

The offline `verify_contract.mjs` check runs actual GLTFLoader parsing and the current production compileBlueprint body without modifying the repository. Its ImageBitmap shim reads only PNG dimensions. All three tiers pass with six semantic markers, 25 primitives, no warnings and no legacyPart fallback. That validates the format/material/transform contract; it does not validate rasterized pixels, decode duration or WebGL frame cost.

## Minimal integration additions (consumer owner decides)

1. Add the recipe at `tools/blender/forge/ships/pip_spanner.py`; it then imports the existing parent Forge kit rather than shipping the snapshot
2. Retain editable `.blend` under `tools/blender/forge/source_assets/pip_spanner/` and keep the motion proposal/contract with this asset's source
3. Place the default model at the requested consumer URL `assets/ships/release/parts/places/place_pip_spanner.glb`, preserving the scene's slot `place`, no-collision/preview-only metadata and all semantic names. Keep alternate files only if that consumer explicitly selects them, one at a time
4. The existing authored asset lease loads the chosen URL with slot `place`; reconstruct six rigid groups from marker matrices and semantic mesh names. Apply the existing material path without per-model global rescue changes
5. Keep selection/item identity/transactions in the existing run owners. Crew motion responds to authoritative receipts. Release/dispose the lease on preview retirement

No fleet.json entry, world entity definition, spawn budget, physics hull, global material mutation or second inventory is needed. This packet leaves all of those files untouched.
