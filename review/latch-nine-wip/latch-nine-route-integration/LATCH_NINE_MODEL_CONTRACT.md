# Latch Nine: next authored model and native-body contract

Status: source specification only. No model was built or visually accepted, and release promotion remains explicitly false. A green model-truth census row is a technical geometry/provenance prerequisite, not art approval. The immutable original SF20-01 dossier remains the design authority; Playfield v2 and the exploratory blockout are not adopted.

## Stable identities and delivery

- Runtime place/census key: `place_latch_nine`
- Source/release part key: `latch-nine`; proposed Forge asset id `SF_PLACE_LATCH_NINE`
- Service role: `latch_nine`, attached only to existing `station_tethys` in `sector_tethys_junction`
- Authored generator: `tools/blender/forge/ships/latch_nine.py`; editable Blender source plus source GLB, all three LODs and measured release metadata must be delivered together. These are new planned paths, not claims that files already exist
- Follow the current Forge publish pipeline and exact existing manifest/census/package contracts. Keep retained source editable and portable; no host-absolute dependencies or materialized full-clone assets

## Shape and source rig

Five-word idea: precise amber industrial signal tender. Low, offset goalpost in plan; thick crossbar; three clearly separate starboard paddles; one rectangular optical shutter; two supported dark-throat drives. No eyes, humanoid limbs, face, game-host gimmick or giant lamp plate. Dark machinery, restrained ivory armor and one amber band language using Forge finishes and modeled panel depth.

Author in Blender metres, +X nose, +Y port, +Z up. Export maps to game/glTF (X,Y,Z)=(x,z,-y); gameplay remains XZ. The dossier's 18×12×5 m, semantic radius14 and mass140 are initial targets. Measure actual exported and swept bounds before choosing gameplay scale; do not copy those targets into a collision body as if already verified.

- ROOT_LATCH: Forge loft sections X=-8,-3,6,9 with half-widths3,4,3,1.5 and top heights1.2,2,1.5,0.5; authored center mass below crossbar
- CROSSBAR: thick chamfered plate spanning nominal X[-5,5],Y[-6,6], thickness0.8 at source Z2; dark recessed central channel and visibly supported shoulders
- PADDLE_A/B/C: separate4×1.2×0.22 m plates, source pivots X=-4,0,4,Y=-4.5; hinge axis+Z, travel[-60,+75]degrees. Determine and record real mount Z from the finished crossbar thickness, rather than inventing a hidden gap
- Use actual `Ship.motion_group` from `tools/blender/forge/motion.py`: stable groups `latch_paddle_a`, `latch_paddle_b`, `latch_paddle_c`, exporting `MOTION_LATCH_PADDLE_A/B/C`. The group's pivot survives LOD welding. Do not animate merged static geometry or introduce embedded glTF clips forbidden by the current blueprint path
- SENSOR_SHUTTER: rectangular1.5 m aperture at nominalX6,Y0,Z1.8; supported ceramic shutter translating0.5 m along sourceY. A named `latch_shutter` motion group must keep the moving member separate from its fixed frame
- DRIVES: supported nozzles at nominalX-7,Y±2.8, with exact authored `HOOK_DRIVE_PORT` and `HOOK_DRIVE_STBD` mouths. Record final sourceZ and exhaust direction from actual geometry; small luminous cores, broad dark throats
- Do not assume the nominal12 m width includes the paddles in every pose. Measure the entire sweep and supply culling/placement bounds from it. Render-only paddles must never enlarge the collision envelope

Initial LOD targets:14k/5.6k/2.5k triangles, near draw budget10, one nearby character. Preserve three readable paddles at100 px body width at the60-degree gameplay camera. Verify muted/grayscale/reduced-motion APPROACH, HOLD and READY without color-only meaning.

## Native physical contract

The tender is a finite-mass dynamic body, never a fixed/kinematic prop. “Kinematic path” means a bounded reference trajectory only. Existing traffic/physics control emits bounded forces and torques; it does not write position/velocity or freeze the body during contact recovery. Use the actual `physicsBody` schema, positive measured mass/inertia, CCD and ordinary contact material. Native failure must fail closed rather than leave a decorative model pretending to be a body.

Collision is the visible structural hull plus a narrow crossbar proxy only if the crossbar materially extends beyond it. Paddles, shutter, lights and drive cores are render-only; supported drive housings belong to the hull proxy. An oversized enclosing collider around empty space is not acceptable.

Important current native-owner constraint: `sg02DynamicBodyOwner.buildCompoundProxyColliderDescs` returns immediately after a valid `manifest.compactHull`. It does NOT append `manifest.primitives` afterward. Therefore “compact hull plus extra box” in one current manifest silently loses the box. First measure whether one compact convex proxy genuinely fits the structural silhouette within tolerance. Otherwise use a validated bounded compound representation through the existing primitive path, or add and independently verify explicit mixed-convex support in its own small prerequisite. Do not claim the dossier's hull+box recipe works unchanged without checking the actual native shapes.

Use `physicsBody.collisionProxyManifest` for explicitly authored structural collision; this is the existing precedence seam ahead of automatically adopted skins. A generic full-model skin may include render-only paddles and close negative space, so do not let it replace the authored structural contract. Validate visible-skin/proxy agreement, contact from three bearings, sweep-clearance and preservation of impulses through Save/Continue.

## Route admission and final activation

The accepted asset packet must explicitly change `LATCH_NINE_RELEASE_PROMOTED` only after real model review and route evidence. Adding a census row alone cannot activate the character.

The runtime presence gate expects exactly one live current-identity tender with `data.role='latch_nine'`, `data.placeId='place_latch_nine'`, a positive-mass dynamic nonsensor body, and `data.latchNineService={stationId,sectorId,box:{minX,maxX,minZ,maxZ}}`. The box is finite, ordered, world-XZ service space derived from the actual station anchor and measured swept corridor clearance. Leaving that box exposes RECOVER; a separate bounded traffic/physics driver must return the vessel by force. These fields are the new Latch integration contract, not claimed pre-existing world APIs.

The next delivery must choose and prove the actual existing entity-render/traffic persistence path for this vehicle, reserve one spawnBudget slot, use the accepted authored asset's real ready gate, persist a semantic world record, and rematerialize fresh exact-life bindings after restore. Do not assume that assigning placeId to an arbitrary entity type is enough to load the right asset. No fallback geometry, speculative normal-route spawn or direct render-transform recovery.

Bind visual direction to primitive `guidance` data from the existing flight target resolver; it never engages autopilot. APPROACH is alignment without permission; GUIDE/CLEAR requires the real docking gates; HOLD is actual refusal/revocation/fencing. Use the post-UI-commit exact-actor receipt for one acknowledgement. The route packet already finishes this cosmetic pulse in paused keepalive without advancing simTime. It still needs a real rendered route test after the model is present.

Final model/route gates: chase/top/close review; nominal and swept bounds; measured LOD/draw cost; strict actor/asset identity; three-bearing physical contacts and recovery; wrong-bearing mouth→berth/mooring approach; revoke while opening; optional dismissal; destruction/disabled ordinary docking; cold Continue during approach and after docking; persistent milestone/incident dedupe; stationBroadcast/shared voice integration and matched performance measurement. Keep promotion false until that coherent packet passes.
