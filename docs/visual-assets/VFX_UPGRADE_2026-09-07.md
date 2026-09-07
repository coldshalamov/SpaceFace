# VFX upgrade audit and implemented candidate — 2026-09-07

## Status and scope

Audited base: `15b54cd1536457d8bbd8ddfbc198860909945f2a`.
Rendered runtime candidate: `e532ab5b5c00742aab94ff51a24936d59199b5b5`.
Branch: `codex/vfx-structured-energy-20260907`.

This is a family-level source audit plus an implemented replacement for shared combat transients. It is not a claim that every VFX recipe has been visually reviewed in normal gameplay, that every effect has been redesigned, or that the candidate meets integrated-GPU performance targets. The normal-game acceptance cells remain open. Master was not modified by this work.

The governing visual standard remains `VFX_TECHNIQUE_STANDARD.md`, with provenance in `SOFT_CARD_INVENTORY.json` and the existing visual-iteration protocol. This audit does not create a competing style guide or mark PQ-190 accepted.

## Diagnosis

The problem is not a blanket lack of rendering machinery. The repository already has pooled geometry, world-space ribbons, plume recipes, event lights, an HDR render graph, phase-driven explosions, contact marks, admission priorities and warmup owners. The weak link is the selection and authorship of the surfaces those systems present.

At the audited base, `combat/instancedSpritePool.js` rendered four broad classes through camera-facing quads. The inventory correctly labelled that path `banned-live` even though its procedural masks had previously been described as an uplift. `combat/arcadeStructuralFx.js` had directional event grammar but flat, uniformly filled blades and arcs. Those shared carriers were the highest-leverage place to change actual gameplay rendering.

There is also a separate, intentionally unwired `src/vfxnext/` library. Its `core/gpuAged.js` still uses billboard carriers. Enabling it wholesale would create a second owner without curing the central visual defect. Likewise, a procedural eight-frame atlas is not automatically high-quality animated source art merely because it is called a flipbook.

## Family-level audit

Paths below are relative to `src/render/` unless stated otherwise. “Unchanged” means this candidate does not claim to have upgraded that owner.

| Effect class | Existing owners and useful structure | Findings and disposition |
|---|---|---|
| Engine jet | `thruster/systems/plasmaStream.js`, `thruster/ribbon/plasmaRibbons.js`, `continuousPlume.js`, `volumetricPlume.js`, family recipes | Player jet already has nozzle-local flowing surfaces; NPC/family paths are separate. Preserve the functioning jet and correct socket axis. Inline throat quads and family-specific breakup need their own close/oblique review. Unchanged. |
| Flight history | `thruster/ribbon/contrailTrail.js`, `engineTrailSurfaces.js`, weapon `ribbonPool.js`, speed-line stroke cache | Distinguish a live jet from historical samples. The player contrail is an immutable record, not a rope to bend with present throttle or a texture to animate backwards. Preserve gaps, rebases and independent cooling. Unchanged. |
| Heavy impact and destruction | `combat/phasedExplosions.js`, `combat/causalStructuralBurst.js`, `combat/arcadeStructuralFx.js`, `vfx.js` | Existing cause schedules and oriented/unoriented force semantics are valuable. Replaced shared flat transient and structural surfaces, retaining event timing, shards and admission. Per-cause layered composition still requires normal-camera review. |
| Shield response | `weapons/shieldContacts.js`, `ships/shipKit.js`, pooled shader in `renderer.js` | The shell already has local contacts and panel structure; replacing it with a generic Fresnel bubble would be a regression. A latent API limitation couples contact strength to age through `hit.w`; the current presenter passes strength 1, so this is not evidence of a live weak-hit defect. Unchanged. |
| Gas, smoke and dust | Shared sprite buckets, explosion residue, plume systems | Smoke/combustion buckets now sample an evolving 3D density/temperature film. This is one reusable impulse film, not a complete soot, dust, vapour and engine-exhaust art collection. Separate material-specific bakes remain necessary. |
| Debris and cargo | `particleShards.js`, structural shard pool, persistent world objects | Preserve opaque, lit, irregular matter and its mass/velocity cues. The new sheet materials apply to light fronts, not physical fragments or cargo. Unchanged matter geometry. |
| Massline | `masslinePresentation.js`, `masslineReleaseArc.js`, `momentumSinkVfx.js`, tether handling in `vfx.js` | Cable, anchor, release and retained momentum are different facts. Keep stable endpoints, clean release and no phantom tension. Shared transient accents inherit the new pool, but the cable/field owners were not remastered. |
| Background | `spaceBackground.js`, `deepFieldStars.js`, deep-field structure/presentation | Distant star flares and authored sky impostors are legitimate background techniques, not permission to turn world-scale objects into soft discs. This candidate leaves the background owner unchanged. |

Additional presentation paths are not hidden by the eight-class summary:

| Path | Source finding | Next bounded upgrade |
|---|---|---|
| Weapon flight | `weapons/energyBoltPool.js` uses velocity-aligned camera-facing dashes with pixel floors and a ribbon wake. Existing tests explicitly preserve that behavior. | Preserve trajectory and pixel readability. Compare an actual material-specific pulse/rail/plasma construction before replacing the carrier; a thicker generic cylinder is not the answer. |
| Muzzle/contact animation | `weapons/flipbookAtlases.js` creates a 1024-square atlas: eight rows, eight 128-pixel frames each, with analytic masks and row tints. | Replace source art family by family with temporal ignition/rupture structure. Keep the existing presenter, atlasing, residency and admission. Do not just increase frame count or noise octaves. |
| Distortion | `weapons/distortionField.js` provides a bounded signed-offset field. Weapon soft-depth access is deliberately disabled while the scene depth is attached to the active target. | Introduce a resolved depth resource at the render-graph seam before internal volume clipping, soft intersections or depth-aware distortion. Never sample the attached depth target as a shortcut. |
| Sustained beams and contact marks | `combat/persistentBeams.js`, `weapons/contactMarks.js`, mining beam/seam owners in `vfx.js` | Keep surface contact and endpoint ownership. Author entry, sustained material response and shutdown separately; do not stretch a transient ring into every beam or mark. |
| Fields and service/event cues | `energy/energyMaterials.js`, `npcJobSignatureVfx.js`, `lawHeatTelegraphVfx.js`, `ceresJobActionVfx.js`, `stationSideEventVfx.js` | Audit each visible role at play scale. Generic noise/Fresnel modulation is not evidence of an authored field interior. Keep informational cues subordinate to collision and weapon contacts. |
| Unwired and lab-only effects | `src/vfxnext/`, `graphicsLab.js` | Do not promote by name or by a lab screenshot. Move one effect through the existing live event owner only after it visibly wins and preserves lifecycle/provenance. |

## Implemented runtime upgrade

`combat/structuredBurstGeometry.js` builds shared swept and folded 3D surfaces for compact impulses, broken compression fronts, blades and arcs. The source is editable geometry rather than a camera-facing mask. Geometry is shared across resident instances; it is not rebuilt each frame.

`combat/transientVfxMaterials.js` adds two material paths. The surface path has cross-section ridges, lips, dark channels, grazing response and lifetime-driven release. The smoke/combustion path ray-marches the offline film through bounded 3D support. The box is a sampling bound, not a visible cube. The fragment writes the first occupied sample's depth rather than the proxy's back-face depth. That does not solve clipping within the volume against opaque scene geometry.

`scripts/bake-vfx-density.py` is reproducible source art: a small projected-flow authoring simulation with transport, compact injection, pressure projection, shear and thermal dissipation. It is cosmetic authoring, not a new game-physics system and not a claim of high-fidelity fluid simulation. The runtime does not run this simulation or synthesize a new hash mask for each puff.

The final film has twelve 48-cubed frames, packed density and temperature, and a 96 × 96 × 144 RG8 texture layout. Texture storage is 2,654,208 bytes, about 2.53 MiB per independent pool owner; smoke and combustion share that owner's texture. Decoded CPU backing is reusable, while disposable texture objects are owner-local. The generated JavaScript module is approximately 347 KB before transfer compression. There is no new runtime npm dependency.

The resident instance contract now carries progress, seed and force heading separately from alpha. The existing public pool names remain for compatibility, but the four buckets no longer use billboard silhouette carriers. The allocation-free writer, bounded capacity, admission priorities, dynamic-buffer owner protocol and reset/commit lifecycle remain in place. Both the live system and precompile salvo use the replacement.

`combat/arcadeStructuralFx.js` now uses the folded materials for blades and arcs with a per-instance age channel. Opaque lit shards remain opaque lit shards. The original causal grammar, spawn priorities, bounded slots and physical event data are unchanged. The old private transient canvas texture factories were removed from `vfx.js` rather than left as another parallel renderer.

## Visual iteration: what failed and what changed

The first candidate compiled and passed its numerical tests. Render review nevertheless rejected two visible problems: radial impulse sheets read too much like petals, and smoke/combustion collapsed into soft balls without internal structure. That revision is not the delivered visual result.

The second revision changed the impulse's directional proportions and taper, replaced overlapping broad source Gaussians with unequal compact lobes and a transported cavity, increased source resolution from 32 to 48, and added bounded self-shadow sampling. The matched frames show the new density shoulders, internal gaps and different oblique silhouettes. The structural blades no longer present as uniformly filled flat polygons.

This remains candidate art. Late density softening, repetition from one shared source film, generic compression-front shapes, and composition when many effects overlap are still review targets. The density light estimate uses the lower temporal frame while density/temperature interpolate; check for subtle lighting steps before promotion. An isolated clear-background grid cannot settle those questions for a crowded game camera.

## Verification and measured cost

The original focused baseline passed 44 tests. Three new behavioral regressions were then demonstrated failing against the old implementation: non-degenerate 3D support, independent progress/seed/axis transport, and finite bounded animation state at saturation. The completed contract suite contains seven new tests, including film evolution/cooling, exact voxel packing, texture ownership and structural lifetime state.

The GitHub runner passed **140/140 focused tests**, with zero skipped tests. The one local Rapier boot failure did not recur when the exact dependency was installed on the runner. `scripts/check-vfx-techniques.mjs` passed. This is not a full repository test run.

The repeatable diagnostic is `scripts/review-structured-vfx.mjs`. It renders the exact audited baseline and candidate with the same camera, event placement, colours and ages, bloom disabled. It uses the real pool and structural modules, but an isolated stage—not the normal game route. It captures four views per version and 24 candidate motion frames. Browser console/page errors and shader errors were absent in the successful run.

Raw evidence: GitHub Actions run `34104570366`, artifact `vfx-structured-diagnostic` / `10011877962`. The artifact contains PNGs, test and bake logs, source commit and per-file hashes; its original retention is seven days. A conversation download copy retains the evidence separately from Actions. The preceding rejected revision is run `34103694613`.

| Same isolated stage | Baseline | Final rendered candidate |
|---|---:|---:|
| Draw calls | 9 | 7 |
| Submitted triangles | 240 | 7,592 |
| Compiled programs | 5 | 5 |
| Renderer-reported textures | 5 | 2 |

These counters are not a performance victory claim. The surface path uses more geometry and the volume path performs up to 20 ray steps with density and light sampling per covered fragment. Transparent pixel coverage and texture bandwidth can dominate on integrated graphics. Fixed instance capacity is not a fill-rate budget. Hardware frame-time and dense-scene measurements are mandatory before default promotion.

Runtime hashes in the evidence:

```text
vfx.js                       aebf91da1b8bb478f391cfbd540a590cfa966bec65e97a0b78925cd20496c134
instancedSpritePool.js        10ec8ca8afa611453d022c0551e47ed5a42ed2493de1fc22832aa70e1fed231d
structuredBurstGeometry.js   2ba71175c19f7e2ddb1853d7dcf23b5eeae0e0597451d496a62a02f570c0f571
transientVfxMaterials.js      5c29c5b3276a8f509f2a88d96b7cd0785f490867ad826bf7d5bcb4e1688d9264
densityVolumeData.js         786e10d71e6ab450cde6af1409ef0bc0c98d06b625df60590144f5d771953216
arcadeStructuralFx.js        2fe1bf8b39e31e5b5d6bf5feb955cd839bd6be09f4703a39d215e9dd550c9a04
```

## Build versus adopt

**Keep the existing event, pooling and render-graph owners. Improve the source-art pipeline and effect constructions.** The implementation demonstrates that Three's current runtime can host the missing spatial techniques without an engine migration. Three documents `Data3DTexture` directly [T1].

**three.quarks is a credible optional authoring/particle adapter**, not an automatic visual upgrade. Its MIT runtime supports batched meshes, trails, billboards, behaviours and serialized effects [Q1, Q2]. This overlaps infrastructure already present here. A trial should translate one approved effect into the existing event/admission/lifetime contract, then compare authoring effort and GPU cost. Do not assume the current cloud editor is covered by the runtime's MIT license; the old editor repository is archived and the current service has separate export tiers [Q3, Q4].

**Effekseer is the stronger candidate for a dedicated external effect-authoring workflow.** Its editor and runtime are open source, with 2D animation and 3D effect export [E1, E2]. Its WebGL integration can share a Three rendering context, but explicitly deals with graphics-state restoration [E3]. Source effects or baked exports can be useful without adding a second live renderer. A runtime integration would need explicit HDR/render-order, depth, warmup, cleanup and context-loss work; it must not be pasted after the final tonemapped scene draw.

Neither dependency is added in this candidate. No third-party art is represented as original work, and no downloaded effect pack is assumed to inherit a runtime library's license. Evaluate imported source art and its license separately.

## Ordered continuation, not a second framework project

1. **Close the candidate's real-game visual and cost cells.** Use the existing packet/broker path, normal camera and exact source identity. Capture single impacts, overlapping destruction, occluders, rebasing, bloom on/off, reduced flash/motion and the dense integrated-GPU profile. Reject geometry that becomes a symbol or wire at actual size. Profile projected coverage and overlap before choosing ray-step or resolution tiers; keep salient contact structure rather than reducing every effect to haze.
2. **Fix the render-graph depth seam.** Add a resolved opaque-depth input with explicit target lifetime and no framebuffer feedback. Exercise near/far projection, resized targets, overlapping geometry and context restore before enabling internal volume clipping or soft intersections. This is infrastructure that directly unlocks better effects, not an isolated harness expansion.
3. **Author material-specific source films and weapon contacts.** Separate hot rupture, cooled soot, mineral dust, vapour and muzzle ignition. Keep the new packing/instance path. Replace the analytic weapon atlas one family at a time, preserving trajectory and contact ownership. Maintain source parameters, versioned bakes and native-size motion evidence.
4. **Converge the remaining owners by class.** Review NPC jets versus player jet; then shield contact timing/panel recovery; then Massline anchor/load/release; then field and service cues. Preserve immutable history and actual matter. Do not replace all of them with the new folded sheet simply because it is available.
5. **Trial external authoring only against a concrete missing capability.** Compare one Effekseer-authored source effect or one Quarks-authored mesh/trail effect against the current path, with the same event and cost constraints. Admit the dependency only when the result visibly wins and eliminates work rather than creating another unconnected library.

Reproduction (from a prepared checkout with the repository's Node dependencies):

```bash
python -m pip install numpy==2.3.5 scipy==1.17.0
python scripts/bake-vfx-density.py
node --test test/vfx-*.test.mjs test/arcade-structural-fx-mount.test.mjs \
  test/weapon-vfx-techniques.test.mjs test/plasma-stream-thruster.test.mjs \
  test/causal-vfx-grammar.test.mjs test/physics-spectacle-cause-vfx.test.mjs
node scripts/check-vfx-techniques.mjs
# Requires Playwright Chromium and the audited base commit available in git:
node scripts/review-structured-vfx.mjs
```

## Primary research sources, checked 2026-09-07

[T1] Three.js, Data3DTexture: https://threejs.org/docs/pages/Data3DTexture.html

[Q1] three.quarks runtime and MIT license: https://github.com/Alchemist0823/three.quarks

[Q2] Quarks renderer documentation: https://docs.quarks.art/docs/core-components/renderers

[Q3] Archived editor notice: https://github.com/Alchemist0823/three.quarks-editor

[Q4] Current Quarks service/export tiers: https://quarks.art/

[E1] Effekseer authoring/export documentation: https://effekseer.github.io/en/

[E2] Effekseer license: https://github.com/effekseer/Effekseer/blob/master/LICENSE

[E3] Official WebGL/Three integration: https://github.com/effekseer/EffekseerForWebGL
