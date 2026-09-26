<!-- LIFETIME: DURABLE -->
# SpaceFace master performance plan — 2026-09-26

Author: devin-perf-pipeline session. Method: measure → pick the pole → leaf → matched A/B → keep|revert,
per `build_map.md` §8 and `PERF_OPTION_SPACE.md` §3. Picture contract unchanged: no default quality cuts
(bloom, shadows, particles, renderScale, pixelRatioCap, population, near meshes all stay). Determinism:
`state.rng`/`state.simTime` only; any proposal that moves the sim hash is flagged and adjudicated with the
same-seed PQ-066 procedure before merging.

## 0. Measured baseline (this box, headless SwiftShader — direction, not absolute)

`probe-frame-solid --headless --cpu-profile`, `.devshots/frame-solid/2026-09-26T03-02-58-913Z.json`:

| Metric | Baseline | After leaves batch 1-2 (03-37Z run) |
|---|---|---|
| missingFrames | 819 | 314 |
| stuckMissing | 596 | 237 |
| flightShaderLinks | 20 | 7 |
| inFrameShaderLinks | 8 | 2 |
| appearOnTimeRate | 0.595 | 0.691 |
| upgradePending | mean 21.6 / max 32, serial inFlight=1 | — |
| upgradeJobs p95 | 8388 ms (`station|miss` 6.7 s, `fx|miss` 8.4 s) | all cancelled-before-load this run |
| CPU top inclusive | sim advance 14.6 s, renderUpdate 21 s, drawPreparedFrame 8.6 s, unreadyDrawGuard 5.4 s, sg02 5.0 s, residency service 3.4 s | same shape, new run |

Headless SwiftShader exaggerates compile costs; headed GPU numbers are the arbiter
(PQ-144.01 matrix is the reference protocol). Directional only.

## 1. Landed this session (branch `devin/1790392438-perf-pipeline`)

| Leaf | File(s) | What | Evidence |
|---|---|---|---|
| Upgrade prefetch widened | partsLibrary.js (`primeNextAuthoredAssetPlan`, `authoredUpgradeAssetRequests`, `startAuthoredJobAssetPrefetch`) | Was ship-only lookahead; now one prefetch chain per lane (next ship + next non-ship). Place/station/fx/payload jobs warm the same `url::slot` decode cache the admission call uses. Bound still 2 chains max — the old all-queue preload is not re-instated. | station/fx `miss` jobs paid 6.7–8.4 s inside the serial slot |
| Residency diagnostics memoized | assetResidency.js (`canonicalDiagnostics`) | Snapshot cached on a mutation epoch (`emit()` bumps it; every mutation ends in emit). | ~0.8 s/flight rebuilding an O(assets) frozen-row table on every seam + 0.25 s poll |
| HLOD level memoized | hlod.js (`updateStationStableLod`) | `lastDetailLevel` skips the whole-subtree traverse + regex when the level didn't change. | Full station traverse + regex per frame per visible station |
| Instance-pool culling collapsed | asteroidInstancePool.js (`syncAsteroidInstancePool`) | `leaf.updateWorldMatrix(true,false)` had no dirty gate: ~200 records × full ancestor walk per camera-dirty frame. Now one `root.updateWorldMatrix(true,true)` per unique owner root + leaf-local refresh. | Explorer: camera-dirty amplification ≈ the whole remaining updateMatrixWorld cost |

## 2. The poles, ranked (evidence in §4)

### Pole A — Pop-in / decode runway (the user's named bug)
Residual: serial authored composition 1.3–7.9 s/job; queue saturates ~21 deep; ships
appear `noMesh` at R0_GLASS while their job waits behind station/fx misses.
- DONE: prefetch now covers non-ship jobs (leaf above).
- NEXT: (a) make one compose job cheaper (repo's stated precondition for re-trying
  overlap — the merge cache was the named path); (b) far-actor restore radius is
  sized by *player* speed only (`farActorTable.js:632` `enter`), so a fast inbound
  row gets minimum decode margin — per-row enter radius from closing speed
  (`rec.vel - player.vel`). **Sim-hash-moving: needs PQ-066 adjudication.**
- Retry/failover gap: a pending-subject root that stalls past admission stays
  invisible indefinitely (render explorer). `_liveGeometryAdmissions.enqueue` only
  arms when `mode==='flight' && firstPlayableFrameAt` — pre-first-frame pendings
  wait for the 0.25 s poll.

### Pole B — entityList / table authority (program's named "next 50%")
Sim explorer measured pocket: entityList=96 live, of which 42 are never-moving optic
lattice cells (`opticStructureId`) and 11 field-grown asteroids — nearest asteroid
308 WU, p50 4201 WU. 279 dormant field rows already exist. Demote lane takes 96→~54.
- PRECONDITION: D50 overlap-safe promote (`promoteAsteroidFieldRock` spawns at the
  drifted `rec.pos`; ram path guarantees overlap → push-apart "yeet").
- Hazards (explorer): spawn order changes → hash moves; demote must NOT release the
  id (`worldLedgerHoldsId` covers asteroidField; an opticRows table must join that
  guard); demote emits entity:spawned/removed — subscribers may draw rng.
- Size: removes ~53 entities from every O(entityList) walk + 42 static colliders +
  42 residency slots + 42 scene nodes.

### Pole C — calendar tick straddle
46 CALENDAR systems all land on tick%30==0 (measured step max 8.11 ms vs p50 2.49 ms;
barkDirector alone p95 1.42 ms). Phase into tick%30 ∈ {0,10,20}: same cadence per
system, spike ÷3. **Hash-moving — mint under leaf.**

### Pole D — projectile sweep batching
`_admitProjectileSweepBodies` runs field+far queries per projectile per step (up to
4× under catch-up). Union the swept segments once per step, intersect per projectile.
Zero behavior change. S effort.

### Pole E — render submit tail
- Shadow pass walks the whole scene per refresh to draw ~5-20 casters
  (three.module.js WebGLShadowMap.renderObject). Maintain the caster list from
  `syncShadowCasterPolicy` (it already computes allowCast per root) or vendor-patch
  renderObject early-out at castBand-zero roots. M; must replicate getDepthMaterial
  variants exactly or shadows diverge.
- Program switches ~100/frame are ~100 genuine distinct programs (sort already keys
  material.id) — the lever is program-count collapse: census distinct program ids
  submitted per frame, extend programCanon to residual variant sources
  (per-object clones, shadow/IBL/light-count key drift). M.
- Per-frame literal allocations: submit options object per entity (~170-300/frame),
  hidden-transition literal, geoStats arrays, fieldKey/dressingKey strings. Pinned by
  `entity-mesh-visibility.test.mjs` contract — convert to scratch + update test.
  GC-pressure hygiene, small.
- hideUnreadySceneDrawables full-scene traverse during pending windows: materials
  dedupe by uuid; pending-subject subtree scoping loses coverage for stray
  never-compiled drawables — keep the walk, add material memo.
- CAS fold into bloom composite on below-res frames — one fullscreen pass saved.
  Needs PQ-111 pixel-diff gate.

### Pole F — UI/HUD/DOM (explorer running)
Known: hud.js frame ~2.0 s/run, domInstrumentation layout reads, audio param churn.
Awaiting the UI explorer's structured output.

### Pole G — assets/transport (explorer running)
Inventory GLB compression (KTX2/meshopt), worker decode, CPU-package accounting,
22 GB repo → what's resident vs pageable. Awaiting structured output.

## 3. Not doing (adjudicated)

From PERF_WHAT_MATTERS + rejected list + this session's review: bloom-off / prewarm
dummies / mixed mega-batch / Rapier-sleep / sim Worker before snapshot fence /
WebGPU near-term / interior-triangle runtime culling / upgrade scheduler off rAF /
disk-paging lean ledger / state-sort. Rust/WASM: legal only after table authority +
snapshot fence, with a named island + copy-cost bench (PQ-083/PQ-091).

## 4. Instrumentation gaps found

- Sim-hitch attribution: `framePhaseMs.sim` is overwritten per step (last step only);
  catch-up steps are usually unsampled → "sim owner, simSystem=null". Fix: per-frame
  steps[] array (count + per-step ms + measured flag); hitch-triggered one-frame
  fullCoverage override on the NEXT frame. Measurement-only, zero hazard.
- Upgrade-job latency histogram exists; add per-job `cacheStatus` + prefetch-hit
  flag to see prefetch efficacy directly (cheap counter).

## 5. Verification protocol

Per leaf: node --check + focused node --test of touched modules → commit → probe
A/B on the same seed path. Keep if missing/stuck/links improve or hold; revert if
picture/behavior regresses. Final gates before PR: `npm run check:baseline`,
`check:playable`, `probe:runtime-witness`, `probe:smooth-flight` (the last two
headed-only on this box — record as deferred to owner GPU).
