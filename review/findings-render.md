# Thermonuclear Review — `src/render/` (108 files, ~69k lines)
Source: read-only Explore subagent (full per-file review). Verified against current committed state.

Severity: 🔴bug/P0 · 🟠material · 🟡taste/hygiene · 🟢clean.

## Cross-cutting vs ARCHITECTURE.md
- 🔴 **`src/render/shaders.js` listed in ARCH §6 (ARCHITECTURE.md:870) but DOES NOT EXIST and has ZERO importers.** GLSL now lives inline in consumers (bloom.js, spaceBackground.js, energy/energyMaterials.js, post/spaceRenderGraph.js, combat/instancedSpritePool.js, vfx.js). Pure dead doc row. Intended truth = inline shaders; fix the doc.
- 🟠 **§6 render manifest lists 10 files; dir has 108.** ~15 modules imported by renderer.js unlisted (assetLoader, partsLibrary, parallaxLayers, spaceReflectionEnvironment, visualOverrides, post/spaceRenderGraph, asteroidInstancePool, renderEntityFrame, presentationWorld/Publisher/Queries, lod, collisionDebug, diagnostics, cameraDirector, dynamicBufferRanges). renderer.js deps "three, bloom, visualFactory" drastically understated.
- 🟠 **Whole subsystems absent from §6**: cameraDirector.js (cinematic pair-framing), post/spaceRenderGraph.js (HDR GTAO-lite + multi-scale bloom render graph), thruster/, energy/, combat/, bespoke ships/ builders, render-package pipeline.
- 🟠 **ARCH §0.14 camera numbers stale**: SHAKE_POS_MAX=1.55 (doc 2.2); TRAUMA_DECAY_PER_S=1.8 (doc 1.6); zoom fully redesigned (DEFAULT_ZOOM=144, MIN 45, MAX 330, speed-zoom 0.88–1.18, physics-earned 1.55× — doc's 55/70/130 presets gone); AIM_BIAS=0.02 (doc 0.25, which appears nowhere); look-ahead 18 normal / 26 cruise (doc only 18); cameraDirector subsystem (gate zoom 720) unacknowledged.
- 🟠 **ARCH §2.4 renderFrame order WRONG.** Doc: syncEntityViews→vfx→camera→spaceBg→draw. Reality (registry.js:630-650): `render.prepareFrame()` (syncViews+cam.follow+spaceBg.update) → `vfx.update(frameDt,state)` → `render.drawPreparedFrame()`. vfx runs AFTER spaceBg not before camera; prepare/draw split with vfx sandwiched undocumented.
- 🟠 **bloom is multi-scale downsample pyramid (full→½→¼) with multi-scale composite (bloom.js:1-16), not §6's "single-pass bright-extract→blur→composite".** Also imports postTelemetry (deps say "three" only).
- 🟡 vfx.js:5 header says update "called every animation frame inside renderFrame (after render.draw)" — stale; it's after prepareFrame, before drawPreparedFrame.

## Per-file
- 🟠 **vfx.js navigation index unusable** (vfx.js:9). Header claims "NAVIGATION INDEX (2,765 lines)" but file is 11,474 (4× growth). Every line ref wrong: _spawnParticle claimed L318 actual L1568; _initMiningBeam L1072→L5283; update L1928→L8282; createVfxPrecompileSalvo L2510→L11068. Real maintenance hazard for a file this size.
- 🟢 vfx.js ~120 Math.random sites — all cosmetic spawn jitter, blessed by vfx.js:6 ("Determinism is irrelevant here"). Never serialized.
- 🟡 renderer.js:3448 stale comment: "spaceReflectionEnvironment.js … never imported anywhere" — it IS imported and called at renderer.js:3456 inside _bakeEnv. Reflection rig is live.
- 🟢 renderer.js preallocated THREE scratch singletons (164-185); new THREE.Group (2403) and PMREMGenerator (3441) are init/admission paths not per-frame. Emits only presentation toasts.
- 🟡 **partsLibrary.js hardcodes `ship_kestrel` as fallback at 5+ sites** (818,844,862,866,874,943 + player-only 666,902), mirrored in visualOverrides.js:33, vfxProfiles.js:164. `sector_helios_prime` hardcoded (3157,3208,3646). Fragile starter coupling.
- 🟡 **precompile.js hardcodes enemy-id lists** LAWFUL_ENEMIES/PIRATE_ENEMIES/FRONTIER_ENEMIES (21-23), TRAFFIC_ROLE_SHIPS (24-31), fallback ship_kestrel (382). Same silent-break-on-rename disease as the wpn_emp_disruptor_m id in damage.js.
- 🟡 authoredAdmissionPolicy.js:64 hardcodes `place_station_trade_hub && sectorId==='sector_helios_prime'`.
- 🟡 **Dead deprecated export `updateFlowFlipbookMaterial`** (flowFlipbookMaterial.js:655-658) — zero callers in src/. Safe delete.
- 🟢 bloom.js DEFAULT_CINEMATIC_TOE=0.0039 — deliberate calibrated divergence, documented.
- 🟢 spaceBackground.js correct determinism (seeded mulberry32 from meta.seed). §6 conflates it with parallaxLayers.js (separate module).
- 🟢 feel.js: NOT a determinism violation — grain uses deterministic LCG (526-548), warp-streaks use Math.random (566-595); both cosmetic. (DOM-layer coupling at feel.js:276,288 querying #hud.)
- 🟡 ships/* (concordPatrol, driftBarge, meridianTrader, quietRaider, reaverPirate, vaelSniper) — 1:1 faction-coupled with hardcoded palette colors. New faction hero ship = new module. Not in §6.
- 🟢 renderPackageManifest.js — generated artifact committed under src/ (labeled "do not edit").
- 🟢 diagnostics.js, lod.js/hlod.js, adaptiveQuality.js, phasedExplosions.js (deliberately avoids Math.random for repeatable captures), combat/phasedExplosions, materialLibrary, parallaxLayers, cameraDirector, assetLoader — all clean, preallocating, documented.
- 🟡 graphicsLab.js DOM-heavy authoring lab — verify it's tree-shaken from production runtime path.

## Confirmed CLEAN (cross-cutting — nobody re-litigate)
- 🟢 No render→sim state writes (grep for state.entities.set/delete, entity.pos/vel/hp writes = reads only). §0.6 honored.
- 🟢 No serialization surface (zero serialize()/toJSON in dir) — nothing THREE/fn-shaped leaks into saves.
- 🟢 Zero FIXME/XXX/HACK in src/render (repo invariant holds).
- 🟢 Hot paths preallocate; every `new THREE`/`new Map` in update/sync is lazy-init-once or build/cache.
- 🟢 No second requestAnimationFrame loop (render rAF refs are afterBrowserPaint helpers + dev labs; main loop owned by core/loop.js).
- 🟢 Date.now/performance.now only in perf instrumentation; feel grain + spaceBackground deterministic; phasedExplosions deliberately non-Math.random.

## Suggested priorities
1. 🔴 Delete shaders.js row from ARCH §6.
2. 🟠 Rewrite §2.4 renderFrame pseudocode to match prepareFrame→vfx→drawPreparedFrame.
3. 🟠 Refresh §0.14 camera numbers + add cameraDirector.
4. 🟠 Rewrite §6 render manifest (108 files) + bloom description.
5. 🟠 Repair vfx.js navigation index (off by 4-9k lines).
6. 🟡 Delete dead updateFlowFlipbookMaterial; consolidate ship_kestrel/sector_helios_prime/enemy-id magic strings; fix renderer.js:3448 stale comment.
