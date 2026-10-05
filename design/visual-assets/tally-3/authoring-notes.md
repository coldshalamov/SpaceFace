# Tally-3 / SF20-03 source-art candidate

Original production geometry, rebuilt from the SF20-03 dossier, original PNG and blueprint. The blockout was inspected as reference and was not promoted. The actual shared Forge kit and finish definitions remain unchanged.

## Source and joins

- Recipe: `tools/blender/forge/ships/tally_3.py`
- Editable file: `tools/blender/forge/source_assets/tally_3/tally_3.blend`
- Source model: `assets/ships/parts/places/place_tally_3.glb`
- Asset ID: `SF_PLACE_TALLY_3`; part ID: `tally-3`; root: `SF_PLACE_TALLY_3_ROOT`
- Motion bank: `assets/ships/motions/tally-3.motion.json`; rig: `tally_3_claim_assessor`
- Exact live hashes, dimensions and collider vertices: `asset-contract.json`
- Geometry-only bay witness: `receiver-clearance.json`

Proposed `fleet.json` entry key is `tally_3`, with `layout: place`, `file: place_tally_3`, `asset_id: SF_PLACE_TALLY_3`, `part_id: tally-3`. This packet does not modify the fleet, parts manifest, model resolver, render-package pilots, release metadata or generated census. The coordinator owns those joins. The recipe accepts Forge publish's `--live` argument and writes its source assets; only the existing publisher should perform release and packaging.

The material finish extras remain `forge-v1`, with six shared panel/machinery images and no per-character texture sheets. The source uses the actual Forge bevel, normal, UV, LOD-weld and export operations. Its collision call deliberately supplies only the real primary spine, rather than the exporter’s default convex envelope over all articulated render geometry.

## Geometry and physical truth

Author axes are +X nose, +Y port, +Z up in metres. Export maps `(x,y,z)` to glTF `(x,z,-y)`, once. Intended runtime scale is 1 WU/m. The measured root-centred outer radius is about 11.413m; the rounded enclosing radius is 11.42WU. Proposed mass is 180 existing internal mass units, a gameplay design value rather than a material-density estimate.

The deployed envelope is approximately 21.86 × 18.55 × 5.62m. Exact values come from the final saved source. The folded width is approximately 10.75m. Genuine unequal open trusses are 7.0m and 5.5m from their hinges. Four continuous longitudinal chords and alternating webs remain actual geometry, including at lower LODs.

One convex `COLLISION_HULL`, made only from `ROOT_TALLY__CollisionSpine`, supplies the physical body. It is 152 vertices / 300 faces; no arm, stamp, cradle or scan collider is added. Approximate glTF collider bounds are X[-10.5492,8.0989], Y[-1.41,.89], Z[-2.3,2.3]. This is a true central spine, not a full-span oval which fills the open cradle or makes the instrument arms solid.

The empty front V admits a 1.20WU-radius cargo body at local glTF [9.6,.31,0]. An enclosing receiver sensor radius of 1.45 permits no more than .25WU centre error for that body. The nearest source surface is the actual spine nose, 1.506995m from the receiver centre; allowing the entire cargo sphere and centre tolerance leaves about .057m clearance. The nearest gold pad is 1.673979m away. A radius-2 cargo body cannot fit and must not be accepted by enlarging the sensor through solid geometry. Real delivery still requires explicit intent, low relative speed and the cargo/economy owner's accepted settlement. This geometric witness does not claim an executed delivery.

`SOCKET_CLAIM_CRADLE` is that fixed receiver frame. `SOCKET_TALLY_SCAN` is seated at the actual source optic [7.876,.54,0] in glTF; its `authorSemantic` is the dossier's `HOOK_SCAN`. This measured location supersedes the dossier's approximate Z=1.5 target. Other joins are `SOCKET_TALLY_STAMP`, `SOCKET_Engine_Main`, `SOCKET_Camera_Focus`.

## Articulated presentation

- `MOTION_TALLY_ARM_LEFT` and `MOTION_TALLY_ARM_RIGHT`: folded 20° reference pose. Assess is 1.4s, opening to75°; disputed is2s with distinct82°/59° working angles; withdraw is1.1s, folding to20°
- `MOTION_TALLY_STAMP`: supported gold press face inside fixed metal guide ring and U-yoke. Receipt alone translates it downward .35m once over .45s, then returns it. No proximity, offer, dispute or mere contact produces a stamp stroke
- `MOTION_TALLY_SCAN`: small physical optical slit, one8° slow sweep during assess. Its carrier remains fixed, reducing a needless articulated draw
- Every clip is a dense60Hz, rest-relative bank. Corresponding individually named editable Blender actions are retained with fake users. No `gltf.animations`, root animation, collider animation, or authoritative body animation is exported

The bank's explicit `settlementRequired` metadata is documentation for the runtime join; it is not a substitute for a settlement-gated caller. The shared motion runtime owns continuity, live-to-key bridging and accessibility reduction.

## Measured cost and honest limits

Exported GLB LOD triangles:16,242 /6,492 /2,133. The earlier LOD2 value2,156 was the pre-export Blender mesh estimate; actual frozen source, release and render-package primitive index counts agree at2,133, and the pre-export estimate is retained in asset-contract.json for provenance. Visible draw primitives:11 /11 /11. Materials:8. Source images:6. Eleven primitives exceed the proposed near target of10 by one; this is documented, not silently treated as a10-draw asset. The static body is7 finish draws and the four genuine moving groups are one each. Reducing the final one would remove a needed signal finish or articulation separation. Source bytes and decoded geometry costs are in the byte checks; observed live game GPU/CPU timings have not been measured here.

## Source visual iterations

- Initial failed attempt:32,068 triangles and16 primitives, denoiser unavailable in this Blender build. The log, source recipe and editable file are retained under source-renders/tally-3-v1. Ordinary Cycles rendering replaced the unavailable denoiser
- V1:16,242 triangles. Inspected top/chase/close/working pixels. Strong outline and open cradle, but shared texture contrast produced checkered trusses and a zigzag metallic stamp rim
- V2:11 primitives. Fixed guide rim, three clearly raised transverse bars, consolidated mechanical/press finishes, calmer truss UV density. Actual50px reductions exposed weak continuous chords, so the work did not stop at the attractive close image
- V3: continuous .18m chords and .09m webs, .90m cage section; a restrained brighter shared metal colour and calm UV density on small structure. Inspected top/chase/close/working/folded pixels. All mechanical pieces are visibly mounted; open channels, unequal arms and receiver negative space remain clear. The labeled50/100/170px source reduction strip includes a4× pixel loupe. At50px the continuous arms survive but fine lattice details naturally do not; at100/170px the open construction is apparent

These are neutral Blender source-review captures, explicitly not the shipping Look, game camera, normal route or physical runtime acceptance. The coordinator must complete those checks through the actual consumer. No publication or integration claim is made by this art packet.

## Rebuild

From the canonical repo:

`blender -b -t 4 --python tools/blender/forge/ships/tally_3.py -- --render --render-version v3`

In an isolated candidate where the shared kit is read-only elsewhere, also pass `--forge-root /path/to/repo/tools/blender/forge`. The manifest records the exact shared Forge file hashes used. Source and per-iteration renders are preserved; only the final owned asset files are candidate inputs for the coordinator.
