# Wave 138 audit — render-traversal / draw-call diet lane (CONTINUING)

Audited `devin/1791504143-perf-w120` @ `e982b5a96` (tip unchanged since the W137 audit — the parent's wave-137 fix-landings had not arrived on this branch at audit time; `git log -3` = e982b5a96 docs, 35d35d292 popin, 0fa8e060e boot). Audit-only: no code, no PR, no app run (SwiftShader box — Electron presents 0 frames). Golden pin `0b33dde1` untouched. W137's census (T1–T14) re-verified on the same SHA; this wave converts the top items to implementation-ready specs and adds what the census missed.

`saturated: false` — three material, mechanism-verified optimizations remain unimplemented in this lane's scope (F1 captured-list replay, F2 instanced registry, F3 transform-signature memo), plus two honest deferred/small items.

Evidence levels: **MECHANISM_VERIFIED** = code structure provably costs the work described. **PERFORMANCE_VERIFIED** = matched before/after measurement on same workload (unavailable on this box by contract). **UNVERIFIED** = plausible, unmeasured. **hardware-unverified** = magnitude needs the owner GPU box (`npm run probe:frame-solid`, `probe:smooth-flight`).

---

## Findings (ranked)

### F1 — GRAPH+AO pays three whole-scene walks where one captured list suffices — `MECHANISM_VERIFIED` — impact H (`high`/GRAPH route only), effort M, risk M

**Mechanism.** `SpaceRenderGraph.render` submits the live scene twice per presented frame: color pass `spaceRenderGraph.js:436` and AO normal pass `:444` under `scene.overrideMaterial = this.normalMaterial` (:439, MeshNormalMaterial). Each `renderer.render` re-runs `projectObject` (`vendor/three.module.js:17835` → recursive `:17985-18097`) — per mounted node: `layers.test`, `frustum.intersectsObject`, `objects.update` WeakMap get, `renderList.push`. Between them `hideInactiveInstancedMeshes` (:442 → :31-41) pays a third `scene.traverseVisible`. On the ≈2,661-node residual that's ~3×2.7k flag visits + frustum tests + list pushes per frame — on the owner receipt scale (~0.67 µs/node) ≈ **5+ ms/frame of pure CPU under `high`**, of which walks #2 and #3 re-derive exactly what walk #1 enumerated (the visible drawable set, modulo the masks).

**Fix spec — captured render-list replay (option (b) of the brief).** Vendor-patch `WebGLRenderer.render` with a capture/replay pair:

- Pass 1 (color, `:436`): after `projectObject` + `currentRenderList.finish()` + sort + `background.addToRenderList` (`vendor:17835-17856`), snapshot the finished arrays — `{ opaque: [...], transmissive: [...], transparent: [...] }` of renderItems (`{id, object, geometry, material, materialVariant, groupOrder, renderOrder, z, group}` — item shape at `vendor:8380-8400`). Items are material-agnostic records; nothing in them is pass-specific.
- Pass 2 (AO, `:444`): a new `renderer.renderCapturedList(scene, camera, captured)` runs the full `render()` prelude verbatim (renderState/renderList push at `17805-17830`, frustum at `17790`, `shadowMap.render` early-out, `info` bookkeeping) but substitutes the captured arrays for `projectObject`'s output — then the unchanged draw path (`renderObjects` → `renderObject` → `renderBufferDirect`) applies `scene.overrideMaterial` per item via `material.allowOverride` (`vendor:18262-18266`) exactly as today. SpaceRenderGraph swaps its second `renderer.render` call for the replay; `hideInactiveInstancedMeshes` + `restoreInactiveInstancedMeshes` are deleted — the masks existed only to feed pass-2's own walk, and the replay filters `object.isInstancedMesh && object.count <= 0` items in O(#items) instead.

**What breaks (the brief's checklist, resolved):**

- `LOD.update(camera)` — ran in pass 1, same camera, deterministic → identical verdicts; re-running it in pass 2 is pure repeat. No re-run needed. ✅
- `objects.update` bookkeeping — captured `geometry` records carry pass-1's update result (geometry/morph/skinning/instanceMatrix once-per-frame upload). Bonus finding: `info.render.frame++` (`vendor:17867`) increments per `render()` call, so pass 2's `updateMap.get(buf) !== frame` is always true → pass 2 re-pays all the WeakMap bookkeeping for every drawable (no duplicate GL upload — `attributes.update` is version-gated at `vendor:407-446`; CPU churn only). Replay skips it entirely — a real secondary win.
- renderOrder/groupOrder stability — captured verbatim on the items; sort is deterministic on identical input, so capturing post-sort arrays makes pass 2's sort unnecessary.
- Material-array group expansion — already expanded into distinct items at pass 1 (`vendor:18044-18058`), replayed as-is.
- Instanced count masks — replaced by the O(items) `count<=0` filter; identical drawn set (a zero-count instance draw is a no-op either way, but the filter also skips its state change as the masks did).
- `scene.onBeforeRender/onAfterRender` — still fire per call (we keep two calls). Lights/shadows arrays in pass-2's renderState stay empty — `materialNeedsLights` (`vendor:18965-18973`) excludes MeshNormalMaterial, and `shadowMap.render` already no-ops post-pass-1 (per-light `needsUpdate` consumed; `lights.length===0` early-out at `vendor:9329`). Program keys unchanged.
- The only semantic gap: `projectObject`'s `visible===false` re-check. If something hides a mounted object *between* the two calls (today only the masks + override swap run there — a quiescent window inside `SpaceRenderGraph.render`), the replay draws it one frame too long — a bounded ghost, not a pop. Contract: no scene mutation between capture and replay; the graph already controls that window.

**Alternative (a) assessed:** the maintained drawable registry (W137 F2, flat leaf registry + mount-watch, Pole-E precedent at `vendor:11-89`) subsumes both T2 and T3 — but it's an L-effort/M–H-risk vendor patch whose catastrophic direction is a missed register (invisible drawable). F1's replay is the strictly smaller change that removes 2 of the ~3 GRAPH-route walks using the same epoch-invariant the mount-watch already proves. Recommend F1 now; (a) remains the follow-on for T2 itself (BLOOM route's single walk).

### F2 — `hideInactiveInstancedMeshes` whole-scene traversal → maintained instanced registry — `MECHANISM_VERIFIED` — impact M, effort S–M, risk low–M (standalone); subsumed by F1 if replay lands first

**Mechanism.** `spaceRenderGraph.js:31-41` walks every visible mounted node per frame to find `isInstancedMesh && count<=0` nodes — discovery cost O(scene) for a target set of ~30-60 live instanced meshes.

**Producer enumeration (all `new THREE.InstancedMesh` sites, so per-producer registration is provably fragile):** `asteroidInstancePool.js:857` (the dominant family — count writes at `:658/:731/:820/:865/:961` and churn), `renderer.js:7196` (contact-shadow pool), `:7538`, `:7594` (ship-aux pools), `particleShards.js:149`, `engineTrailSurfaces.js:373`, `combat/instancedSpritePool.js:154`, `arcadeStructuralFx.js:131`, `gasVolumeField.js:80`, `tetherWebFx.js:38`, `broodPresentation.js:108-189` (6), `livingHullPresentation.js:347-365` (4), `emergentPrimitivePools.js:445`, `sweptSurfaceBatch.js:492`, `parallaxLayers.js:299`, `killcamStage.js:151/:166`, `racingCourseView.js:38`, `asteroidInteriorPreview.js:246/:267/:1043`, `characters/rubricModel.js:158`, plus specimen/probe meshes (`partsLibrary.js:477/:15362`, `precompile.js:1311/:1345/:1377`, `programCanon.js:341`, `renderer.js:20895/:22016/:22114/:22174`). A registry covering all of them cannot be per-producer-maintained without misses; count-write sites are similarly scattered (pool submits, burst fills, `count=0` resets).

**Spec (registry + ancestor re-prove — the Pole-E shape, proven in-tree at `vendor:11-89`):**

- Module-level `_instancedMeshRegistry = new Set()`; the already-patched `Object3D.add`/`attach` (`vendor:148-175`, currently only unfreezing ancestors) additionally does `if (object.isInstancedMesh) registry.add(object)` plus a one-time subtree scan of the mounted root for nested InstancedMeshes — O(subtree) once per mount, versus O(scene) per frame.
- `hideInactiveInstancedMeshes` iterates the registry and re-proves per entry the invariants `traverseVisible` got for free: ancestor chain reaches the rendered scene AND every ancestor (including self) has `visible !== false` — verbatim the `eachShadowCaster` loop (`vendor:60-77`). Members that fail the re-prove are skipped exactly as `traverseVisible` skips them.
- No count-write hooks needed: the `count<=0` check runs per registry entry per frame (~50 checks). No removal machinery needed for correctness — detached nodes fail the ancestor re-prove; a bounded compaction (registry size > K → rebuild-keep-rooted pass) prevents lifetime growth.

**Cost shift:** O(#instanced × depth-to-scene ≈ 50×8) vs O(mounted ≈ 2,661). Same drawn set: mask/restore semantics unchanged (layers-mask 0 → restore pairs). If F1 lands, this reduces to the one-line replay filter — do F1 first; the registry is the standalone fallback for the BLOOM/NATIVE routes (which don't mask today — their zero-count instanced draws are already no-ops, so the registry has no standalone value there either; it's specifically the GRAPH AO path that wants it).

### F3 — Transform-signature memo inside the vendored `updateMatrixWorld` — `MECHANISM_VERIFIED` — impact M–H (every route, incl. BLOOM default), effort M, risk M

**Mechanism (the T1 floor, sharpened this wave).** The vendored walk (`vendor:103-146`) calls `this.updateMatrix()` **unconditionally** on every `matrixAutoUpdate === true` node — `matrix.compose(position, quaternion, scale)` + `matrixWorldNeedsUpdate = true`, which then forces the `matrixWorld` multiply AND sets `force = true`, propagating a mandatory descent into every descendant. So every live node pays compose+multiply+forced-descent every frame even when nothing wrote to it — this is the real ~O(mounted-live) floor, deeper than "flag visits": on the 2,661-node residual it's ~2.7k composes + ~2.7k multiplies + forced subtree walks under every re-posed root, 60×/s.

**Spec.** Cache an 11-float signature `(position, quaternion, scale)` per node (rotation proxies through quaternion — `rotation._onChange`/`quaternion._onChange` chain, `vendor/three.core.js:11833-11846`). In the vendored `updateMatrixWorld`:

```
if (this.matrixAutoUpdate && signatureUnchanged(this) && this.matrixWorldNeedsUpdate === false)
    skip updateMatrix();        // matrix already === compose(current transform)
else if (this.matrixAutoUpdate) this.updateMatrix();
```

Then the existing flag logic runs verbatim. Clean nodes cost ~11 compares instead of compose+multiply, and — the bigger half — they no longer mint `force=true`, so their subtrees evaluate their own flags instead of being force-descended. This *subsumes* F6's hidden-subtree savings (hidden static content stops composing too, not just matrix-marked content) without any new mint sites.

**What breaks:**

- Direct `.matrix`/`.matrixWorld` writers on `matrixAutoUpdate === true` nodes were already stomped by upstream's unconditional compose — the signature skip preserves that semantics (the stomp becomes a no-op only when the transform fields agree; a field write still bumps the signature). Manual `matrixWorldNeedsUpdate = true` sets still work — the flag is checked before the signature.
- Code mutating `position`/`quaternion`/`scale` object *contents* via the Vector3/Quaternion APIs is captured — signature compares element values, not object identity.
- Unsafe only for a writer that mutates `.matrix.elements` directly AND relies on `updateMatrix` to fix it — already broken upstream.
- Composes with the W137 F3 dirty-root list orthogonally: the memo makes the residual walk cheap; the dirty list removes the walk's flag visits. Order: signature-memo first (smaller blast radius — no new bookkeeping surface, benefits every route).

### F4 — Small-scene `renderer.render` fixed-cost floor (T6) — `MECHANISM_VERIFIED` — impact L, effort M, risk M — **honest verdict: real but small; accept or defer**

**Enumeration.** Per-frame `renderer.render` calls on O(1)-node scenes: AO quad ×3 (`spaceRenderGraph.js:_renderAo` — ao + 2 blur), bloom pyramid ≤4 (`_renderBloom`), composite ×1 (`_renderComposite`), photo grade ×0-1, distortion producers ×0-3 (`_renderDistortion` — real scenes but bounded), FullscreenQuad.render `:842` is the 2-node scene each pays on. `presentUiStage` (`uiStage.js:1293`) off flight path.

**Fixed cost per call (verified):** `renderStates.get`+`init` (`vendor:9130-9144` — WeakMap get + 3 array clears, cheap), `renderLists.get`+`init`, `projScreenMatrix` multiply + `frustum.setFromProjectionMatrix` (~150 flops — the largest prelude item), `clipping.init`, `background` early-outs, `shadowMap.render` early-outs (`enabled`→`autoUpdate`→`lights.length===0`, ~3 branches), `info.reset`+`frame++`, transmission check, multisample/mipmap early-outs, `bindingStates.resetDefaultState`, `onBefore/AfterRender` dispatch. Estimated ~10-40 µs/call owner-side ⇒ ~50-300 µs/frame at 4-10 calls. hardware-unverified magnitude.

**Lite-path spec:** `renderBufferDirect` bypasses the prelude but `setProgram` reads `currentRenderState.state.lights` (`vendor:18502`) — needs a live render state, so a `renderQuadDirect` vendor entry would push one shared scratch renderState per frame (amortized across all blits) or take a patched `render()` flag (`__sfLitePass`) skipping only projectObject+sort+background+shadowMap. The dominant per-draw cost — `setProgram` → `getProgram` → `getProgramCacheKey` (parameter build + key join over ~40 axes) — survives any lite path; only a per-material program memo removes it (`materialProperties.currentProgram` early-out already covers repeat binds).

**Verdict:** L impact × M effort × M risk — land only if the vendor file is already being touched for F1/F3 (shared patch cost). Do not promote to H: the floor is small relative to the ~2.7k-node walks F1/F3 remove.

### F5 — B5 program consolidation (unowned residual) — enumeration + ranked merges — mostly required-distinct; residual = coverage + one verifiable class

**Material census (static, `new THREE.<X>Material` site counts at e982b5a96):** MeshStandardMaterial 222, MeshBasicMaterial 108, ShaderMaterial 58, MeshPhysicalMaterial 28, SpriteMaterial 4, LineBasicMaterial 5, PointsMaterial 2, MeshDepthMaterial 2, MeshNormalMaterial 1, RawShaderMaterial 1. Each (material-state × object-axes) pair mints a distinct program under the ~40-axis dedupe signature `canonicalProgramSpecimenSignature` enumerates (`programCanon.js:194-267`: type, customProgramCacheKey, 26 texture slots × channel, envMap, blending/side/transparent/premultipliedAlpha/forceSinglePass, alphaTest/alphaHash/alphaToCoverage, vertexColors, dithering, flatShading, wireframe, fog, sizeAttenuation, toneMapped, clearcoat/transmission/dispersion/iridescence/sheen/anisotropy, combine, depthPacking, index0AttributeName, normalMap type/format, extensions, defines-JSON, geometry attribute itemSizes, morph attrs, instancing/skinning/points/line/sprite).

**The ~26/frame floor composition:** route permutation (GRAPH×AO×shadow×depth) × lit material families (Standard/Physical families × object-axes instanced/skinned/static) + fixed post set (AO/blur/bloom/composite/grade ≈ 5-6, MeshNormalMaterial × axes ≈ 2-4) + depth/distance variants per shadow-caster — dominated by **required-distinct** programs (different GPU code paths; merging them is illegal under the quality contract).

**Merge ranking:**
1. **Double-side transparent side-flip duplicates** — `renderObject` (`vendor:18283-18295`) draws `transparent && side===DoubleSide && forceSinglePass===false` items twice with `material.needsUpdate=true` between → **two programs per material**. Mostly already handled: `planarAdditivePolicy.js:12-13` plus ~15 `forceSinglePass:true` sites across vfx/hull/bloom/precompile. Residual = verify the uncovered set is empty on owner hardware (one-line census inside probe-shader-compile-timeline's program dump: `programs` grouped by `side`+`transparent`+`forceSinglePass`). **UNVERIFIED — likely ≈0 today.**
2. **Defines-JSON / same-family collapse** — the existing mechanism (authoredMaterialProfiles familyKey `:100`, specimen dedupe) already collapses authored families; remaining splits are per-object-axes (instanced vs static, skinned vs not) — **required distinct, illegal to merge.**
3. **The 36 draw-time misses** — decode-later ship/station signatures unresolvable at admission (HILLCLIMB-LOG exp.7: warming the reachable set REFUTED — the gap is residency *coverage*, not warming strategy). **Owned by boot/popin lanes, not a consolidation item.**
4. **Never-drawn-path variant pruning** — materials whose variants compile but never draw in a session (e.g. `transparent:false` static variants of a family only ever drawn transparent). Can't be proven statically; needs the owner-side DRAW-TIME-MISS owner list.

**Concrete recommendation (cheap):** commit the per-run `DRAW-TIME-MISS` owner dump (`probe-shader-compile-timeline.mjs` already prints it) as a scoreboard artifact each wave so the 36-item list becomes enumerable without re-running probes — currently no captured copy exists in-tree (checked wave130-137 reports + design/perf).

---

## Regression notes

**W136 machinery — verified concretely at e982b5a96:**
- **Posting-class claim lapse-ability** — `claimArmClass` at `assetResidency.js:842-844` = `SECTOR_ARM_CLAIM_ROLE.test(role) || decodeWarm===true` (regex `:838` warm|runway|prewarm|armory|predicted). Threaded through `unionOwnerSector` postArmClass (`:409`), retain merge-path default (`:848`), decodeWarm qualification (`:1039`). **Test run: `test/asset-residency-sector-claims.test.mjs` — 6/6 PASS** (node24, extracted `src/render` + test file; includes "lapse-ability follows the POSTING class", "warm-arm lapse gated on rotateSector + deferred", "pending claims clamped to horizon not born lapsed").
- **Save machinery shapes** — `_pendingSlotRearm` at `saveSystem.js:394`; `specByteHit` verdict + gen guard at `:4875-4916` (`spec.sig !== 'gen:' + _saveStoreGeneration`); `peek_card_data` worker op at `:5041`. Their three known defects are IN-FLIGHT EXCLUSIONS (parent-owned this wave) — shapes confirmed present; defects not re-reported per contract.

**W137 own-claims held (same SHA, verified):**
- Residual mounted ≈2,661 — stands as arithmetic (16,506 owner receipt `renderer.js:22914-22917` − 13,845 parked warm roots). Park machinery intact: `_parkBoundedWarmRoots` detaches via `root.parent.remove(root)` and publishes `render.parkedWarmRoots` for probe-side recount (`renderer.js:22924+`). A true recount is hardware-gated (no game run on this box); the invariant the number rests on is verified in code.
- Whole-scene `updateMatrixWorld` call sites — still exactly one on the presented path (`renderer.js:31898`; `scene.matrixWorldAutoUpdate=false` `:10311`/`matrixAutoUpdate=false` `:10317` ⇒ `render()`'s own walk is gated off). Camera-only sites `:9388-9389, :12772, :26548, :31674, :31944`; staging/admission sites (`assetLoader:1554/:1924`, `precompile:360-971`, `partsLibrary`, `openingGpuAdmission:695`, `shadowDepthAdmission:1072/:1181`) are off the presented frame. **No second whole-scene site introduced.**
- T2/T3/T4 walks still present verbatim (`spaceRenderGraph.js:436/:442/:444`) — F1's spec is written against current code.
- Pole-E caster registry, `sfMatrixFrozen` vendored skip, unready mount-watch, paced-ledger machinery — all intact at audited SHA.

## Hardware-unverified items for the owner GPU box

1. Per-walk ms for T2/T3/T4 at the ≈2.7k-node residual — extrapolated ~0.67 µs/node from the 16.5k receipt ⇒ ~1.8 ms/walk; F1 removes ~2 walks ≈ ~3.6 ms/frame under `high`. Verify with `npm run probe:frame-solid -- --cpu-profile` bracket on `_renderPostRoute`.
2. F3 signature-memo: fraction of the residual walk spent in compose+multiply vs flag-visit — the memo removes the first half unconditionally; measure `updateMatrixWorld` wall delta owner-side (the walk's total is the pre-park ~11 ms scaled to residual ≈1.8-2.2 ms).
3. T6 prelude total ≈50-300 µs/frame estimate — `?drawhist` + per-pass `performance.now` brackets inside SpaceRenderGraph.
4. B5 double-side-non-forceSinglePass residue — one grouped census line in probe-shader-compile-timeline's program dump.
5. Any GPU-side claim (draw calls, uploads, fill) — out of scope on SwiftShader by contract.

*Report ends. Audit-only; no source files modified.*
