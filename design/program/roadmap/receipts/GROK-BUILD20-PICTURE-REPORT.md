# GROK-BUILD20 picture report

Seed 4242 where a seed applies. Owned files only. No commit.

Command: `node --test test/grok-build20-picture.test.mjs`
Result: 15 pass, 0 fail.

Nearby regression, same turn: `node --test --test-name-pattern "inline package-cache|inline tier|context loss|byte pressure" test/asset-residency-refcounts.test.mjs`. Result: 6 pass, 0 fail.

## 31 — true for the direct skip; invented poles are not warmed

A real opaque `MeshStandardMaterial` or `MeshPhysicalMaterial` is a redundant direct specimen, so the crucible warm does not mount `SF_CrucibleWarm_PaletteMesh` for it. `Material.prototype.onBeforeCompile` is a function on every Three material and is not counted. An own `onBeforeCompile`, transparency, alpha-hash, transmission, or a player-hull stamp still mounts the direct mesh. The instanced twin of the material the hull already has is unchanged.

`cruciblePoleVariants` no longer invents the opposite side, a clearcoat of 0.12, or an alphaTest of 0.02. Those programs are not ones the live hull compiles. A plain opaque hull mounts zero extra pole meshes. A material that already has clearcoat, alphaTest, or a non-front side also gets no second pole: the instanced twin already links that combination.

## 32 — the existing draw hold

While opening admission handles are still pending, the presented frame stays held (`pendingAdmission > 0` returns before the draw). Nothing already on screen is removed. `firstPlayableFrameAt` is still stamped when the first picture paints.

The self-check `openingAdmissionKeepsVisibleCohort(pendingAdmission, pendingAdmission)` was always true and is gone. The `openingControlReady` write is gone. That flag was never read. Flight does not consult a control latch from this gate, and none was added.

## 39 — true

Belt-tail GLB starts use the shared decode budget (`resolveDecodeTaskBudgetLimit`, floor 2) instead of a hard cap of 2. File dedupe is unchanged. The ambient geometry lane can finish several fast roots in one present and still yields to the next present once the slice clock or a tight compile-wait is spent.

## 45 — true

One living-machine score decides decorative motion. The player always stays in motion. A ship or station on the glass stays awake even when stopped, because that role's boost sits above the floor. Off-glass bodies sleep. The present loop uses that awake flag for hull bob, forge crown, boss dressing, asteroid tumble, station arms, gates, and place motion, and also for authored motion and site presentation. Shots, pickups, ordnance, wreck drift, damage, drive, and simulation velocity are not gated by the score.

## 75 — true

Plain opaque MeshStandard / MeshPhysical families keep a single instanced warm path, including the later-wave deferred warm. The direct palette mesh is mounted when the family is transparent, transmission, alpha-hash, player-stamped, compiled with its own hook, or when the file is the player's own hull. The game knows that hull from the live ship spec, not from a flag nobody sets. The cache key is not rewritten. The player hull is not forced onto the batch.

## 139 — true, on the asset key the glass already retains

The visibility pin and the eviction lookup now use the same key: the asset key already stored on the registry entry the glass owner retains (`render-package:<contentHash>` for a package, `url::slot` for a source blueprint). The present loop calls `noteOwnerVisibility` on the mesh and the entity, which are the owners the glass already passes to `retain`. It does not pin the entity id. Context restore re-pins those same keys for the arrival roster. An entity id alone does not protect a package.

There was a real mismatch before this edit: `noteVisibility(entityId)` never matched `visibilityHolds.get(entry.key)`. No fake pin was added for a body that has not retained an asset.

The 64 MiB package-cache default is unchanged. An explicit null soft cap still resolves to the governor ceiling (384 MiB). Pinned roles are not evicted. Off-glass holds still drop after 8 presents. The arrival roster and its miss counter are unchanged.

## 140 — the edge counter does not consume sim input

Each present still publishes the residency canonical object once when it is unchanged, and the arrival roster sample uses the nearby count rather than a universe scan. `input.js` was not edited.

The present edge counter only writes a picture-side latch and `renderState.presentInputEdges`. It does not clear, consume, or otherwise change sim input. A held button stays held in `state.input.actions`. That counter is not an input consume.

## 141 — not reproduced

Not a fix. No pose writer was added.

Starvation: belt-tail concurrency never exceeds the decode budget, and the ambient slice yields once its clock is spent. Residual retention: soft eviction still refuses pinned roles and visibility-held asset keys. A pose delta under 1e6 world units stays inside the envelope. A larger delta recorded with no writers stays `not-reproduced`. Calling the recorder with no writers is not a repaired jump.

## 259 — not wholly true

- FB-091: ambient admission width is the yield above. `liveGeometryAdmission.js` was not edited.
- FB-092: arrival roster on sector entry, with a miss counter for the first 600 presents.
- FB-096: NOT DONE. Slot preallocation lives in `src/render/vfx.js`, which this job cannot edit.
- FB-097: a 16-slot hitch ring is preallocated on `state.render` and records presents at or above 33.4 ms. The witness report was not changed (`runtimeWitness.js` is protected).
- FB-098: NOT DONE. The present no longer builds `createBatchedInstanceRenderer`, and it does not publish `batchedArchetypeDraws`. Per-entity meshes are still the live draw. Publishing a draw count of 1 while those meshes still draw would have been a lie.
- FB-141: NOT DONE. Probe doors live in `package.json`, which is outside this write set.
- MACH-03: asteroid instance capacity is reserved from the roster, including before a mesh exists, and capped by the residency ceiling. Seed 4242, roster 200, first 600 presents: 0 power-of-two rebuilds. LOD is unchanged.
- MACH-07: `state.render.geometryPending` is the queue's queued count and a draining sequence publishes 0. No per-mesh walk. The witness does not print it, because that file is protected.

## Left outside this write set

MACH-04 bloom-on-software-GL (`bloom.js`). MACH-06 / MACH-09 (`world.js`, `runtimeWitness.js`, `snapshotFence.js`). FB-096. FB-098. FB-141. The unread flight control latch. Witness lines for the hitch ring and `geometryPending`.
