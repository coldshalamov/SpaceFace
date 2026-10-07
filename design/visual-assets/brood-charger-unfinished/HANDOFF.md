# Charger: unfinished art, publication handoff

## Status

The user rejected the current model quality on 2026-10-03. **This is preserved work for another artist/agent to finish, not accepted production art.** The parent briefly accepted the C5 source-form direction for continued technical validation; that is not user acceptance. No remote writes, PR, merge, deployment, runtime registration, or release publication was performed by this worker. The parent owns publication.

No further artistic polish was attempted after the rejection. C6 preserves the C5 form while meeting the existing LOD budget and seating non-contact sockets on its actual surface. All earlier studies remain available and must not be mistaken for production assets.

## Start here

- `candidate-c6/review/c6-matched-lod-review.png`: actual cold-imported in-file tiers, fixed cameras and 170/96/64px reads
- `candidate-c6/review/c6-action-review.png`: exact named rigid action poses, with quaternion-correct import handling
- `candidate-c6/review/c6-structural-review.png`: side, underside, and shared-normal-map isolation
- `candidate-c6/charger-animated-source.blend`: current editable geometry and twelve real Blender actions
- `candidate-c6/charger-LOD{0,1,2}-source.blend`: intentionally section-authored editable tiers
- `candidate-c6/brood_charger_v01.glb`: single resident GLB with all three tiers and the three shared motion pivots
- `candidate-c6/brood-charger.motion.json`: Forge-generated motion bank, sealed to that GLB
- `contracts/proposed-charger-contract.json`: exact convex/body/socket proposal, not installed
- `FINAL_HANDOFF_MANIFEST.json`: immutable hashes and exact path-specific handoff inventory

## Why the art is still weak

The technical repair is real, but it does not establish a mature artistic result. The creature is still dominated by a uniform pink horseshoe and smooth repeated abdominal roof sections. The broad shield's modest seams subdivide a molded-looking mass; they do not supply enough believable growth anatomy, a distinct face, meaningful surface transitions, or the kind of large/medium/small functional construction visible in the actual Kestrel, Salvage Cutter, and Trade Hub references. The mouth is recessed and geometrically real but visually inconsequential. The stabilizers read as simple paired leaf/paddle shapes, and the underside remains too smooth and generic. Pale contact tips look like attached tips rather than a strongly resolved impact organ. This is not fixed by adding texture noise, more identical plates, arbitrary rods, or increasing triangle count.

The next artist should reassess primary/secondary anatomy and surface hierarchy using actual game references, rather than treating the accepted-direction Mite/Splitter or these meshes as the quality ceiling. Preserve gameplay intent and exact contacts; propose source-derived proxy changes if the new anatomy changes. Do not polish this same shape indefinitely merely because its technical gates pass.

## Technical work that is usable

- Verified current Charger profile: range160, 45 windup ticks, 144 commit ticks, 84 recovery ticks, speed96, damage30
- Mass90, radius13, COM[1.3,0,0], and physical bounds[-10,-1.6,-9] to[11,3.6,9] remain unchanged; bounds are retained for inertia semantics
- Two contact sockets remain exactly [11,0,±3.8], including the real attack-driver meaning: actual native contact during commit, not an invented pose event
- True head-fork clear volume remains open: [3.65,-6,-1.1] to[11.8,6,1.1]
- Three original pivots and amplitudes remain: two .42-rad X folds and a .8WU X abdomen translation. The fixed underlying support carries the projected solid footprint
- One resident GLB; 3712 / 2308 / 1428 triangles, six draws per tier, three opaque materials, two shared images. Original budgets6000/2600/1500, seven draws, three pivots, four materials are not raised
- Original Forge biological palette and unchanged normal/ORM generation. The subtle broad-face banding disappears when the shared normal map is disconnected; the pinned normal-isolation render is included. No replacement shared texture was authored
- Nineteen source-derived convex parts, <=12 vertices each, minimum caliper width>=.01WU
- All138 distinct actual fixed-tick fractions of the existing action driver, including reduced-motion endpoints, pass the cold-GLB conservative bidirectional projected bound .098284272WU at every LOD. The report includes .028284272WU raster allowance, explicit zero native/visible fork overlap, and all sampled bounds
- Fifteen source anatomical meshes per tier are finite, closed/manifold, and have no zero-area faces
- Six focused Node tests pass for preserved physical tuning, all budgets, bounded convex geometry, GLB-bound motion, every sampled motion key, and editable source topology

These are CPU/DCC checks. **No canonical native/projectile/LOS/tether installation, real game Look, default-route acceptance, target-GPU measurement, swarm40 performance, or release registration is claimed.** The inherited cloud browser restriction was not bypassed. User rejection outweighs all technical pass results.

## Non-contact socket proposal

The old dorsal and signal origins floated above this candidate. The new attachment positions are ray-cast onto its actual central crown:

- Dorsal tether: [1.2999999523162842,1.9518966674804688,0]
- Signal: [3.1500000953674316,.21004676818847656,0]

Both exact contact sockets are unchanged. The candidate body map names the proposed convex support parts and retains the original physical/inertia envelope. The shared geometry owner must admit the same shape for every real consumer; do not install a private render-only collision interpretation.

## Rebuild and inspect

Set `SPACEFACE_FORGE_ROOT` to a compatible checked-out `tools/blender/forge` directory. The current readonly default is `/workspace/shared/SpaceFace-integration-d0ae/tools/blender/forge`. Set `SPACEFACE_RUNTIME_ROOT` to the actual integration tree for the focused Node tests. Current tests default to sibling `splitter-runtime-candidate`.

1. For each tier0,1,2: `CHARGER_LOD=<tier> CHARGER_NO_RENDER=1 blender -b --python source/build_charger.py`
2. `blender -b --python source/assemble_candidate.py`
3. `blender -b --python source/bake_motion.py`
4. `blender -b --python source/verify_source.py`
5. `python source/check_footprint.py`
6. `blender -b --python source/render_cold_review.py`
7. `python source/assemble_review_sheets.py`
8. `node --test tests/charger-candidate.test.mjs`

`source/derive_proxies.py` reproduces the proposal from the explicitly preserved C5 source geometry. C6 keeps that silhouette; its own exported bytes and every action fraction are separately checked in `candidate-c6/footprint-check.json`. When changing anatomy, derive a new proposal from the new source rather than reusing this one blindly.

Rebuild into a new version directory, never over this frozen evidence. The optional glTF-Transform dedup output is a packaging candidate only; its receipt states exactly what changed and its paired bank uses its own hash. It does not make the art accepted.

## Publication scope

`patches/handoff-paths.json` lists this entire worker-owned handoff under a single review-only repository destination. It deliberately does not overwrite registered runtime assets or shared code. A subsequent implementation PR can promote approved replacement geometry through normal Forge source seals, manifests, packages, exact source-bound collision consumers, and installed tests. Do not make the historical rejected model live merely to claim the handoff was implemented.
