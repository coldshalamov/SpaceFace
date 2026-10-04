# Model, animation and delivery recipe

## Status and authority

The PNG plates, SVG plan studies and GLB blockouts in this package are original procedural concept references. They are not production meshes, authored Forge releases, approved rigs, or game screenshots. The image-generation tool also produced unrelated posters; those were rejected and are not packaged as art for these concepts. No unrelated poster names are canon.

The included GLBs preserve raw author-space blockout geometry and simple colors. They do not have production UVs, verified normals, collision proxies, animation clips, shared materials, compressed textures, or guaranteed runtime axes. Rebuild through Forge; do not drag them into release assets. They exist so another agent can inspect proportions in 3D instead of reverse-engineering a painting. Model target dimensions in the dossier outrank the approximate blockout.

## Authoring sequence

1. Read `tools/blender/forge/FORGE.md`, `docs/visual-assets/LOOK.md`, the nearest nested AGENTS file, and current release tooling. Follow any newer canonical contract discovered on rebase. [R03,R04]
2. Confirm each stable concept id is unused. Inspect active and recently merged character work, especially MORROW, VESPER, BRACKET and possible RAVEL/KNELL branches. Search by behavior as well as names; naming is not novelty.
3. In Blender, build at the dossier's author-metre envelope using +X nose, +Y port, +Z up. Put the main origin at the proposed hull center; put each mechanical origin at its actual hinge. Parent visible parts to one root, with named child pivots for moving pieces. Mark simulation sockets distinctly from render-only landmarks. [R04]
4. Build silhouette first with Forge `loft`, `plate`, `annulus`, `truss`, `beams` and supported nozzles. Preserve the specified negative spaces. Review at top view and the game's 60-degree chase tilt before adding detail. Large jaws, pods and ribs need attached supports, not floating greebles. [R04]
5. Use the existing shared finish vocabulary: paint, paint2, stripe, dark, gunmetal, bare, ceramic, stone and appropriate glow finishes. The concept chooses identity color and geometry, not an independent material-physics pipeline. Inset bands and raised panels do the visual work; avoid random grime/noise that breaks top-down readability. [R04]
6. Separate only genuinely moving/damageable parts. Every separate material on every separate mesh can cost a draw; a ten-finish palette does not guarantee ten draws if twenty articulated objects each use it. Merge static geometry by material and isolate minimal moving parts. Use the packet draw count as a proposed target to measure, not a claim that the blockout meets it.
7. For hard-surface articulation, use node transforms rather than a skeleton where practical. Keep baked glTF node clips for predefined gestures; draw actual physics joints from simulation state. For fauna, use a small rig or one documented vertex-deformation path, not both competing for the same vertices. Root motion must never move an authoritative world body.
8. Generate three LODs. Dossier counts are target triangle ceilings, not measurements. Preserve attack silhouette and interactive socket locations at LOD1/2. Drop cosmetic greebles first. Physics proxies are independent and must not change with visual LOD. [R04]
9. Derive collision separately: convex hulls/boxes/capsules for dynamic bodies; simple compound shapes for fixed infrastructure with holes. Never convex-hull an entire ring/door and accidentally fill the opening. List every child that becomes a new body on release, its mass allocation and initial velocity rule.
10. Export through the repository's selected glTF convention exactly once. A normal Blender Y-up glTF conversion maps author `(x,y,z)` to `(x,z,-y)`; confirm the actual Forge release transform with a three-axis marker, and do not add a second compensating rotation. The game's model factory/pose adapter remains authoritative for heading sign. [R03,R04]
11. Publish through the existing release process. Do not hardcode raw authoring paths in production or create a competing loader. glTF compression and KTX2 transcode need compatible decoders; current upstream documentation does not prove the repository's vendored version supports every extension. Reuse its pinned tooling. [R01,R04,T01,T02]
12. Open actual renderer captures and inspect them. A receipt saying “export succeeded” cannot show clipped geometry, wrong materials, or a hidden weakpoint. Record top/chase/close images, attack phase images, and a default-route screenshot before declaring the asset complete. [R03,R04]

## Mechanical animation contract

State transitions happen on simulation ticks. For a 60-Hz timer, use integer durations (for example, 0.9 s = 54 ticks). A visual pose can interpolate `u=clamp((t-t0)/duration,0,1)` and use `smoothstep(u)=3u²-2u³`. It may not move the damage tick or infer a successful transaction. Interruption begins from the current pose rather than snapping to a clip's assumed start. [R03]

A released part inherits `v_part = v_parent + omega × r_socket` and the parent's angular velocity as appropriate. Remove its compound collider before enabling its separate body and update mass exactly once. Never keep both colliders enabled. Visual mesh, collision body and gameplay id must refer to the same released object.

World body transforms come only from the physics owner. Cosmetic bob, roll and shader phases are children under a render-only root; collision shapes and scan/attack geometry never read them. Gameplay timers and random choices cannot depend on wall time, the render rate, asset completion timing, or cosmetic RNG.

## VFX and sound contract

Every attack has anticipation, commitment, action and recovery. The packet timings are initial balance proposals; tune them against actual stopping distance and visibility. Geometry, motion and audio reinforce a single meaning. Reduced flash suppresses bursts, not essential knowledge. Every critical audio fact also has a caption, physical pose or inspectable label.

Create short authored beam volumes, ribbons, mesh bursts and localized shield/heat effects using existing pools. No blanket fog shell, opaque camera-facing square or new full-screen filter for one character. Keep bright effects smaller than the target they explain except when a deliberate major event earns the frame. Reuse existing audio buses, voice arbitration, cooldowns and stale-drop rules. [R03,R14]

## Residency and proposed performance budgets

Only the nearby encounter is fully resident. Chart representations use existing derived proxies, capped by the repository's map contract rather than loading full hero GLBs. Proposed local content caps are in each packet. They do not authorize bypassing spawnBudget. [R07,R15]

Start a feature review with measured baseline p50/p95/p99 frame times, long tasks, physics time, draw calls, triangles, active entities and GPU/CPU memory on a declared device. A 60 FPS target gives 16.67 ms per frame; this is arithmetic, not evidence that the game achieves it. Set a provisional incremental budget of 0.2 ms p95 simulation for one small encounter coordinator and 1.0 ms p95 render work for one hero addition on the reference device; revise openly using actual measurements, not promises. Do not add the per-feature budgets for all twenty because all twenty must not be simultaneously active.

Load on the established nearby/arrival path, stage expensive work, and retain a honest fallback if a asset is missing. A progress bar must not claim “ready” before the required render/interaction state exists. Do not invent a second asynchronous boot framework for content.

## Production commands already described in the inspected repo

```
blender -b --python tools/blender/forge/ships/<ship>.py
node scripts/fleet-look.mjs --file=assets/ships/forge/preview/<file>.glb --views=inspect,close,top
node tools/blender/forge/publish.mjs <ship>
node scripts/flight-look.mjs --ship=ship_<id>
npm run check:atlas-integrity
npm run check:map-frames
npm run check:atlas-place-path
```

These are reference commands from R04/R15 with placeholders; resolve the actual registered asset ids. New places may use different registration/publish steps than ships. Confirm current package scripts before execution. No game commands were run in this design review.
