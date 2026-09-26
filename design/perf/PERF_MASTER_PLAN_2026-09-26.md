<!-- LIFETIME: DURABLE -->
# SpaceFace master performance plan — 2026-09-26

Author: devin-perf-pipeline session. Method: measure → pick the pole → leaf → matched A/B → keep|revert,
per `build_map.md` §8 and `PERF_OPTION_SPACE.md` §3. Picture contract unchanged: no default quality cuts
(bloom, shadows, particles, renderScale, pixelRatioCap, population, near meshes all stay). Determinism:
`state.rng`/`state.simTime` only; any proposal that moves the sim hash is flagged and adjudicated with the
same-seed PQ-066 procedure before merging.

## 0. Measured baseline (this box, headless SwiftShader — direction, not absolute)

`probe-frame-solid --headless --cpu-profile`, `.devshots/frame-solid/2026-09-26T03-02-58-913Z.json`:

| Metric | Baseline (03-02Z) | After batch 1-2 (03-37Z) | After batch 3 (06-06Z, first honest full route) |
|---|---|---|---|
| missingFrames | 819 | 314 | 82 |
| stuckMissing | 596 | 237 | 52 |
| flightShaderLinks | 20 | 7 | 19 (all admission lane, none presented-draw) |
| inFrameShaderLinks | 8 | 2 | 2 |
| appearOnTimeRate | 0.595 | 0.691 | 0.889 (36 episodes — 2.6× more content approached) |
| upgradePending | mean 21.6 / max 32, serial inFlight=1 | — | mean 17.3 / max 28, busyShare 1.0 — saturated |
| upgradeJobs p95 | 8388 ms (`station|miss` 6.7 s, `fx|miss` 8.4 s) | all cancelled-before-load this run | 10 jobs, pending-bound |
| CPU top inclusive | sim advance 14.6 s, renderUpdate 21 s, drawPreparedFrame 8.6 s, unreadyDrawGuard 5.4 s, sg02 5.0 s, residency service 3.4 s | same shape, new run | queryFarActors 440→0 self; updateMatrixWorld/unreadyDrawGuard/classifyWorld off top-self |

NOTE on the 05-25Z intermediate run (not tabulated): it read as a clean pass (0 missing, appear
1.0) but was degenerate — the probe ship never approached the station (`back` phase stalled at
~2000 wu, 14 appear episodes, 0 upgrade jobs), so it sampled an empty deep-space window. The
06-06Z run is the first post-leaf run to fly the complete route into a saturated admission burst;
its residual is Pole A throughput, which the deep-queue pipeline-gate overlap leaf (e8cf5f4ec)
targets. Directional headless numbers only.

Headless SwiftShader exaggerates compile costs; headed GPU numbers are the arbiter
(PQ-144.01 matrix is the reference protocol). Directional only.

## 1. Landed this session (branch `devin/1790392438-perf-pipeline`)

| Leaf | File(s) | What | Evidence |
|---|---|---|---|
| Upgrade prefetch widened | partsLibrary.js (`primeNextAuthoredAssetPlan`, `authoredUpgradeAssetRequests`, `startAuthoredJobAssetPrefetch`) | Was ship-only lookahead; now one prefetch chain per lane (next ship + next non-ship). Place/station/fx/payload jobs warm the same `url::slot` decode cache the admission call uses. Bound still 2 chains max — the old all-queue preload is not re-instated. | station/fx `miss` jobs paid 6.7–8.4 s inside the serial slot |
| Residency diagnostics memoized | assetResidency.js (`canonicalDiagnostics`) | Snapshot cached on a mutation epoch (`emit()` bumps it; every mutation ends in emit). | ~0.8 s/flight rebuilding an O(assets) frozen-row table on every seam + 0.25 s poll |
| HLOD level memoized | hlod.js (`updateStationStableLod`) | `lastDetailLevel` skips the whole-subtree traverse + regex when the level didn't change. | Full station traverse + regex per frame per visible station |
| Instance-pool culling collapsed | asteroidInstancePool.js (`syncAsteroidInstancePool`) | `leaf.updateWorldMatrix(true,false)` had no dirty gate: ~200 records × full ancestor walk per camera-dirty frame. Now one `root.updateWorldMatrix(true,true)` per unique owner root + leaf-local refresh. | Explorer: camera-dirty amplification ≈ the whole remaining updateMatrixWorld cost |
| Numeric far-cell keys | farActorTable.js | `${cx}:${cz}` string keys → `(cx+O)*S+(cz+O)` ints (same scheme asteroidField already used). | `queryFarActors` 440 ms self per run — decode-runway disc ran the string-grid every tick |
| Sim follow-up measurement | perfRuntime.js | Hitch-classified `owner==='sim'` frames without `simFullyMeasured` arm a full-coverage next frame. | Gap §4: catch-up steps were unsampled → attribution read `simSystem=null` |
| Unready-material memo | bloom.js (`unreadyCheckedMaterials`/`unreadyHiddenMaterials`) | Per-material verdict memo inside the pending-window traverse; sets cleared per pass. | `unreadyDrawGuard` 1.88 s inclusive on the CPU profile |
| Meshopt decode → worker pool | renderPackageLoader.js (`startMeshoptWorkerPool`), assetLoader.js | `MeshoptDecoder.useWorkers(min(4, cores-1))` once at decoder wiring; GLTFLoader already prefers `decodeGltfBufferAsync`; falls back to main-thread when Worker is unavailable (node --test). CSP grants `worker-src 'self' blob:` + `wasm-unsafe-eval`; meshopt worker is pure `WebAssembly.instantiate`. | Assets explorer: 243/267 packages are meshopt; all decode was synchronous WASM on the present thread — the decode slice of every serial admission job |
| Package fetch force-cache | renderPackageLoader.js (`fetchVerifiedRenderBytes`) | `read('no-cache')` → `read('force-cache')` first pass; SHA-256 + `reload` re-read still gate correctness. URLs are content-hash immutable. | Per-package ETag revalidation round-trip per fetch |
| Geology fallback stays visible through admission | partsLibrary.js (`wrapPlacePropWithAuthoredPart`) | Same-envelope skins (`placeTargetRadius === radius`) keep `fallbackRoot.visible = true` wrap→commit instead of blanking at wrap. Commit still swaps; fail path already re-showed. | Loading explorer: the D38 residual (~0.9 s, six stuck frames, asteroid id 4) was structural — nothing drew for the whole admission window |
| Geometry-admission retry cooldown | liveGeometryAdmission.js | After `MAX_ADMISSION_RETRIES=4` the dedup latch was permanent — one transient GL failure left a mesh invisible forever. Now a 4 s cooldown reopens dedup so the ambient lane retries on a slow cadence (the no-per-frame-loop intent is kept). | Permanent-latch pop-in vector |
| Union-sweep projectile batching | physics.js | One union-disc field+far query per step covers all projectile sweeps; per-projectile `segmentCircleHitInto` filter; not-covered fallback for mid-sweep spawns | `queryFarActors` 440.5 ms self → off the profile |
| Shipworks boot defect fixed | modelTruth.js | `shipworks.js` imported `modelTruthMountFractions` — never exported in git history → ES link error on open. Implemented as sockets→entityRadius fractions | Dead-on-open screen; round-trip verified |
| Write-on-change audio params | audioSystem.js | `_setParam` last-value guard on engine-hum/duck/drill/slipstream beds (was ~10 AudioParam automation inserts/frame on own rAF) | UI explorer: per-frame automation churn |
| HUD signature gates | hud.js, bandHud.js, masslineHud.js, comms.js, survivalHud.js, hullIntegrity.js | Scalar sig gates skip string builds + DOM writes when the rendered value didn't move; massline/comms idle fast-paths return before pos/camera reads | hud frame-path string churn |
| Retained projection/pick scratch | renderer.js (`raycastToPlane(ndc,out)`, `writePlaneXZ`, `_rayLocalXZ`), bulletTime.js, drawFlightInput.js, floatingText.js, damageIndicators.js, capitalBossOverlayMount.js, input.js | Per-frame `{x,y,onScreen}`/`{x,z}` allocations → caller-owned scratch (all consumers synchronous) | `getBoundingClientRect`-adjacent alloc residue, 89 ms self |
| ship:thrust payload reuse | flight.js, flightV3.js | One retained payload + 4-slot nozzle pool; subscribers are synchronous (eventTrace deep-copies) | Per-tick payload + nozzle array alloc while thrusting |
| Moment-pulse edge trigger | bulletTime.js (`_updateMomentPulse`) | `timeEffects.clear()` = Map delete + min-scan every sim tick; now transitions only, trick-arm path syncs the latch | 206 ms self |
| Corridor manifest memo | dockingCorridor.js | `resolveCollisionProxyManifest` ran 2×/station/tick (update + diag publish); memoized per entity on the static `collisionProxy` key; retained `state.dockingCorridor` readout (berth keeps null contract) | 123 ms self |
| Seam-marker relevance latch | vfx.js (`_seamMarkersRelevant`) | Full asteroids-bucket scan per frame → `{indexVersion, drawWu, margin, ttl}` cache; re-scans only when membership, radius, or a closing-speed bound says the verdict can flip | Per-frame O(asteroids) relevance scan |
| COOP/COEP on probe host | scripts/lib/gameServer.cjs | `crossOriginIsolated` → ~20× timer resolution + the SAB transport door; does NOT activate the phase-14 worker (explicit opt-ins still required) | Measurement explorer gap |
| GPU-process metrics witness | electron/main.cjs, preload.cjs | `spaceface:perf-metrics` → `app.getAppMetrics()` per-process CPU/memory — attributes GPU-process link stalls vs renderer busy frames | In-page counters can't see the GPU process |
| Probe GC boundary | scripts/probe-frame-solid.mjs | `--js-flags=--expose-gc` + `window.gc()` before the sampler — boot garbage out of the measured window | gcMs attribution noise |
| ~~Deep-queue flight overlap~~ REVERTED (47f88a5cf) | partsLibrary.js | Granting `overlapAuthoredPipelineCompile` at dispatch when pending > 8 measured net-negative on both runs: leftUndrawn/episodes 2/36 → 30/45 → 69/119, in-frame links 2 → 11. On a compile-bound renderer the presented-frame budget is the scarce resource — overlapping the GPU gate stacks links into drawn frames. The serial slot stands; Pole A residual needs cheaper jobs, not overlapped stages | 06-24Z + 06-29Z A/B |

## 2. The poles, ranked (evidence in §4)

### Pole A — Pop-in / decode runway (the user's named bug)
Residual: serial authored composition 1.3–7.9 s/job; queue saturates ~21 deep; ships
appear `noMesh` at R0_GLASS while their job waits behind station/fx misses.
- DONE: prefetch now covers non-ship jobs (leaf above).
- MEASURED-REJECTED: pipeline-gate overlap under a deep queue (47f88a5cf — in-frame
  links tripled, leftUndrawn per episode 10×). The slot stays serial.
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

### Pole G — assets/transport (explorer verdict in)
Transport is already well-engineered (content-hash packages, zero-copy SHA-256 worker,
embedded KTX2, ref-counted residency). Landed: meshopt decode on the vendored
blob-worker pool; force-cache first read. Queued, not done this session:
- **24 stale whole-ship-LOD release artifacts ship uncompressed** (raw PNG + unquantized
  geometry, ~84 MB across lod1/lod2 pairs; e.g. wasp ~23.5 MB embedded PNG). These load
  exactly when a hull family streams in — worst-case pop-in decode. Fix = re-run them
  through the sg04 ktx2+meshopt transform, rebuild render packages, regenerate both
  manifests atomically, extend `check-sg04-release-assets.mjs` WHOLE_SHIP_FILES so the
  release-compression gate covers lod files. One manifest row (`leviathan_production_v1_lod2`)
  is already drifted — a partial rebuild happened; verify `check:art` actually gates.
  Effort M; PNG→ETC1S on distance LOD needs a frame-diff before commit.
- **Decoded-CPU-payload detach** — the only NEW write-to-disk lever found (ledger paging
  stays rejected): after the `spacefaceGpuResident` stamp, release decoded arrays and
  rebuild on context restore via re-fetch+re-parse of the resident package. Frees
  tens-to-hundreds of MB of JS heap; changes the context-restore contract to a serial
  restore runway. Effort L — needs a detach-aware updateBuffer contract.
- Loading-pipeline leftovers (loading explorer): deadline-aware insert into the strict-FIFO
  plan lane, deeper ship-agnostic prefetch lookahead, in-job stage overlap. The serial-slot
  release variant stays parked (its patch is filed under `.devshots/parked/`).

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
