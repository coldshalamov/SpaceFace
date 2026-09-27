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
| Mesh-build drain on poll frames | renderer.js (`serviceRenderMeshResidency`) | The `_drainMeshBuildQueue(8)` call only ran on the 'deferred'/'held-first-flight'/'drain' branches — 'full'/'poll' reconcile frames skipped it entirely, so a queued mesh-build sat a whole poll cadence (the `noMesh` asteroids at rows 38/14 of the probe). Now every pending-queue frame drains. Late-present gate + retry backoff unchanged. | noMesh residue in the 06-06Z honest run |
| Submit-options scratch | renderer.js (`_submitVisibilityOptions`) + test update | The per-entity `shouldSubmitEntityMesh({...})` literal (~170–300 allocs/frame) is one module scratch, every field rewritten per call site so no stale flag leaks. The test's source contract moved from literal-regex to assignment-regex. | Pole E GC hygiene |
| Calendar cohort straddle | catchupPolicy.js, authoritativeSystemManifest.js, test update | The 46 CALENDAR owners all fired on `tick%30===0` (step max 8.11 ms vs p50 2.49 ms). `calendarCohortIndex(id) = index%3` in CALENDAR_CLOCK_IDS → cohorts run `tick%30 ∈ {0,10,20}`; same 2 Hz cadence per system, manifest order preserved inside the tick (cohortQueues = all minus other cohorts). Boot ticks (<=1) and `clockWake.calendar` still run every cohort. **47a golden reproduces bit-identical** (`f542e2e9`) — legacy47a walks `all` every tick; straddle is production-profile only. | explorer: step max 8.11 ms vs p50 2.49 ms; barkDirector p95 1.42 ms |
| lodFamily gate expansion | scripts/build-sg04-release-assets.mjs, scripts/check-sg04-release-assets.mjs | Both enumerated `part.file` + the hand-maintained WHOLE_SHIP_FILES list, never `part.lodFamily` — 23 manifest-managed lod1/lod2 release GLBs shipped byte-identical raws (~70 MB) with manifest rows claiming ktx2+meshopt, and 24 render-package lod renders embed the same raws. Both scripts expand lodFamily into the managed set; gate correctly reports `release.compressedAsset` until the staged rebuild lands. | Pole G census; confirmed by `.devshots/probe-check.mjs` (wasp lod2 flagged not-releaseReady) |
| Pole A(b) CLOSED (already covered) | presentationSources.js + farActorTable.js + renderer.js | `appendNearbyLedgerRows` scans shelved far rows on a `(travel + TABLE_INBOUND_APPROACH_WU) × TABLE_DECODE_RUNWAY_SECONDS` disc, extrapolates `lastExactT`+vel, and admits rows closing within the runway into `collectMeshPresentationEntities` → `kickDecodeRunwayAssets` → `preloadAuthoredAssetsForEntity`. `meshNeedsAuthoredDecode` returns true for mesh-less ledger rows. No leaf needed — verified end-to-end this round. | verified via source trace |

## 2. The poles, ranked (evidence in §4)

### Pole A — Pop-in / decode runway (the user's named bug)
Residual: serial authored composition 1.3–7.9 s/job; queue saturates ~21 deep; ships
appear `noMesh` at R0_GLASS while their job waits behind station/fx misses.
- DONE: prefetch now covers non-ship jobs (leaf above).
- MEASURED-REJECTED: pipeline-gate overlap under a deep queue (47f88a5cf — in-frame
  links tripled, leftUndrawn per episode 10×). The slot stays serial.
- NEXT: (a) make one compose job cheaper (repo's stated precondition for re-trying
  overlap — the merge cache was the named path; `compositionPrimitiveCache` landed).
  (b) CLOSED — already covered: `appendNearbyLedgerRows` scans far rows on a
  `(travel + TABLE_INBOUND_APPROACH_WU) * TABLE_DECODE_RUNWAY_SECONDS` disc,
  extrapolates shelved pos via `ledgerPredictedPos`, and pushes closing inbound
  ship rows into `collectMeshPresentationEntities` → `kickDecodeRunwayAssets`
  warms `preloadAuthoredAssetsForEntity` while the row is still shelved.
- Retry/failover gap: a pending-subject root that stalls past admission stays
  invisible indefinitely (render explorer). `_liveGeometryAdmissions.enqueue` only
  arms when `mode==='flight' && firstPlayableFrameAt` — pre-first-frame pendings
  wait for the 0.25 s poll.

### Pole B — entityList / table authority — CLOSED (measured not-worth-it, 2026-09-26)
"Next 50%" was measured when entityList was 408 under the parasite; the landed
table-authority work already took the fat lanes (279 dormant field rows, shelved
far actors). Residual: 96 live, of which 42 are optic lattice cells. Why demote is
wrong now: (1) per-tick systems consume entityIndex lanes, not raw entityList —
the only raw-list walks left are lifetimeSweep, incremental index reconcile, and a
few system paths (~3 raw `for (const e of entityList)` sites); (2) optic cells must
stay collidable + radar-visible + rendered, so they would remain in collidables /
spatialStatics / physicsStatics / radarAsteroids anyway — demote trims only the
handful of raw walks, ≈126 entity-touches/step ≈ microseconds; (3) the price is
L-effort: a parallel static-collider feed for the broadphase, radar/overlay table
reads, save round-trip, spawn/despawn event ordering (rng-moving), and
`worldLedgerHoldsId` guard coverage. D50 (`resolveAdmitOverlap` + exempt ram path)
already landed on master — the precondition exists; the leaf doesn't pay for it.

### Pole C — calendar tick straddle — LANDED (82da377ed)
Cohorts of index%3 in CALENDAR_CLOCK_IDS phase onto tick%30 ∈ {0,10,20}. Turned out
**not** hash-moving: the 47a golden runs the legacy47a profile, which walks `all`
every tick — straddle is production-only, `check:sim` reproduces `f542e2e9` exactly.
Test updated to pin cohort phase + wake-runs-all semantics.

### Pole D — projectile sweep batching — LANDED (e9ab3de59)
Step-level union bbox queried once (`_sweepUnionBounds*`); segments inside it reuse
the union rows via `segmentCircleHitInto` per body; a projectile spawned mid-sweep
falls back to its own queries. Order-preserving, zero behavior change.

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
- ~~Stale whole-ship-LOD release artifacts~~ DONE (commit `d2f7fa4e7`): all 23
  manifest-managed lod GLBs rebuilt through the real pipeline (EXT_meshopt_compression
  + KHR_mesh_quantization + ktx2 verified in outputs; e.g. atlas lod1 721 KB → 113 KB,
  massline 4.7 MB → 2.8 MB; wasp grew 12.5 → 13.4 MB — its embedded textures barely
  shrink under basisu). The 30 `*_production_v1` orphans (~26 MB, referenced nowhere)
  are deleted; all 128 stale pilot bindings refreshed and all 267 render packages
  rebuilt. `check-sg04-release-assets` green (was 23 `release.compressedAsset` errors);
  `check-render-package-pilots` green (267/267 fresh). Original census for the record:
  53 raw GLBs under `release/parts/wholeships/` (~70 MB; wasp lod1+lod2 alone ~25 MB,
  15 raw PNGs each).
  A further 24 `render-packages/*-lod*/render.glb` were compiled from those raw sources
  (massline/wasp embed raw PNGs directly). Root cause: the build and the gate enumerate
  `parts_manifest` `part.file` + a hand-maintained `WHOLE_SHIP_FILES` list, never the
  part's `lodFamily` siblings — colossus/ironback/leviathan/pelican lod tiers fell
  between the two lists. Fix landed this session: both scripts expand `lodFamily`;
  `--only` rebuild of the 23 stale entries + pilot refresh/rebuild + orphan delete
  (held pending the in-flight UI test run — build is CPU-saturating).
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

- ~~Sim-hitch attribution~~ LANDED: `framePhaseMs.sim` is still last-step-only, but hitch
  verdicts now carry `simStepMs[]` + `simStepMeasured[]` (bounded 8-step ring, written only
  while `hitchAttributionEnabled` — alloc-free otherwise). The next-frame fullCoverage
  override already existed (`simFollowupMeasureThisFrame`). A multi-step hitch now names
  which step owned it instead of reporting the trailing cheap one.
- ~~Upgrade-job latency histogram + per-job `cacheStatus`~~ ALREADY COVERED:
  job diagnostics carry `cacheStatus: 'hit'|'miss'` (every plan file already
  resident at job start = the prefetch runway worked) plus duration/latency —
  the prefetch-efficacy counter exists.

## 5. Verification protocol

Per leaf: node --check + focused node --test of touched modules → commit → probe
A/B on the same seed path. Keep if missing/stuck/links improve or hold; revert if
picture/behavior regresses. Final gates before PR: `npm run check:baseline`,
`check:playable`, `probe:runtime-witness`, `probe:smooth-flight` (the last two
headed-only on this box — record as deferred to owner GPU).

## 6. check:baseline adjudication (this box, 2026-09-26)

`npm run check:baseline` exits 1 with five failures; **all five reproduce
identically on origin/master (25c1356a3) on this box** — zero introduced by this
branch:

- `sim` (47-A hash): actual `9a22c3d4…` on both master and branch — environment
  drift, not code. Note: the check harness spawns system node v20.19.0 while
  direct runs use node24; `Math.*` implementations can differ across runtimes,
  and expected envelopes were minted on the maintainer's environment.
- `sim-v3` / `sim-v3-compare`: `--reload-at 60` reload-hash `1ca1b448…` diverges
  from baseline `9d6074be…` identically on master — a preexisting v3 reload-path
  divergence, not this branch.
- `pq020-ceres-topology`: `worldOneOff` live fx count 10 vs expected 11 +
  `structuralCostDigest` mismatch — identical failure set on master
  (world-content drift vs recorded expectations; the known stale-asset family).
- `ui-control-labels`: expects `/A dock/` for `controlPrompt('station','gamepad')`,
  actual `'B dock when prompted'` — identical on master; my diff touches zero
  binding/label code (verified `git diff` clean of `dock`).

Preexisting-on-box failures already verified earlier (not in this run's FAIL list
but confirmed against master this session): `render-package-pilots` GLB SHA
mismatch (~24 stale LOD artifacts, ~84 MB), world-place/station fallback empty
Group, `authored-preload-scope` owner-inactive throw, `crucible-live-geometry`
retry-budget semantics.

### Post-merge CI adjudication (master = 314cfaaa8, all reproduced on master tip)

- `static (1)` program-docs: 33 `integratedCommit is not an ancestor of HEAD`
  errors — the receipts point at rebase-orphaned commits (e.g. 77976fd3 exists in
  the object store but is not an ancestor of origin/master either); the queue
  file is byte-identical to master's.
- `feel` ×4 (`fun-bench-flight-scenarios` B2/B3 turn-radius + visible-depth
  clauses; `hitstun-curve` ×2): identical failures on master tip under node24 —
  master's own flight/hitstun numbers drifted off contract.
- `draw-flight` `accelerates to actual G cap`: `s.speed` = 312 on branch AND
  master tip (expected 145–160) — upstream physics drift, not the diff. (The
  earlier `fixtureReady` timeout was a strict-MIME `.json` module rejection in
  the check's own server — fixed f4885cb2e; the speed assert remains upstream.)
- `check-autopilot-v3` (not in the CI matrix, run locally): the
  `throughline-ambush` encounter never records `escaped` — identical on master
  tip. Master-side, unrelated to the straddle (fails with the straddle reverted).

### Second-round CI adjudication (head 86bb8b59b, 2026-09-26)

- `sim`: PASS — the calendar straddle (82da377ed) leaves the 47a golden
  bit-identical as designed.
- `static (1)`: same 33 program-docs ancestry errors as adjudicated above.
- `static (2)` 9 failures, every one reproduced identically on a detached
  master-tip worktree on this box (node24): `bar-faction-greetings-test`,
  `check-title-attract` (hash `a719167d` vs expected `6b41e1fd`),
  `check-ui-control-labels` (`'Space/F/3'` vs `'Space/F'`),
  `check-gamepad-mission-log`, `check-countermeasures`,
  `check-sg08-render-vfx` (fleet-overflow streak assert),
  `check-phase0-slice-contract` (unclassified `Math.random` in
  `constellation.js`), `check-authored-place-runtime`.
  `check-sg05-runtime` fails only in CI — passes on BOTH master and this
  branch locally → CI-environment flake, not the diff.
- `static (3)` 3 failures, all identical on master tip: `check-onboarding`
  (gamepad glyph drift: expects `B dock`, actual glyph map changed),
  `check-kestrel-wholeship`, `check-bundle`.
- `feel` ×4: same B2/B3 flight-contract + `hitstun-curve` failures, identical
  on master tip (B2 turn-radius 1.264 vs ≤1 on both).
- `draw-flight`: same adjudicated `accelerates to actual G cap` speed assert.
- `browser`: cancelled (dependency), not run.
- **Zero new failures attributable to this branch.**

### Third round (head 3206ebc05 — gate fix + hitch instrumentation + Pole G assets)

- `draw-flight`: same `accelerates to actual G cap` assert (adjudicated twice above —
  `s.speed`≈312 on master tip too; unrelated to assets/instrumentation).

### Fourth round (head 462833565 — pose-gate dealloc + manifest pins)

- `draw-flight`: same `accelerates to actual G cap` assert — fourth occurrence.

### Draw-flight root cause + fix (head — this branch)

Root-caused the assert with a headless real-path replay (`bootRealPath`, seed 4242,
same hull/systems): the ship equilibrates at exactly **312.00 WU/s**, the authored
draw cap = `combatSpeed` 195 (drive_reaction_m) x `AUTO_TARGET_PATH_OVERDRIVE_MULT`
1.6. The window `145<speed<160` was written when governed cruise was ~95 and went
stale at e8d10fed7's cruise-ceiling restore (Sep 16); master never reached this
assert because the fixture died earlier at `fixtureReady` (MIME) until f4885cb2e.
Replayed the full check sequence headlessly — turn speeds hold 312 (momentum
conserved), `vel.z`=312>140, brake→0.2<3, stroke-restart works. Only the accel
window was stale; refreshed to 300-325 with the derivation in a comment.

### Fifth round (head 128d81f82 — draw-flight fix)

- `draw-flight`: **GREEN** — the refreshed window passes.
- `static (1)`: same 33 program-docs ancestry errors as adjudicated twice above
  (fails identically on master tip 314cfaaa8; the integratedCommit SHAs live in
  the pre-Sep-8 archived history that was never pushed).

### Sixth round (head 1f151a793 — settled)

- `sim`: PASS. `draw-flight`: PASS (fix verified in CI).
- `static (3)`: 2 failures — `check-onboarding` + `check-kestrel-wholeship`
  (lod0 40468 tris vs 36000-38000 — **byte-identical on master tip**, verified
  locally on the adjudicate worktree). `check-bundle` now passes — likely
  improved by the Pole G asset rebuild.
- `static (2)`: same 9 adjudicated master-side failures as round 2.
- `feel`: same 4 adjudicated master-side contract failures (B2/B3 + hitstun).
- `browser`: skipped (upstream shard dependency) — unchanged from prior rounds.
- `check` rollup: inherits the shard failures.
- Final end-state probe on this head (two runs, high box noise): missingFrames
  511 then 217, stuckMissing 347 then 141 — same admission-bound classes as the
  06-06Z run, inside the probe's ±2-4x run-to-run envelope (the 06-29Z run read
  875 on near-identical code). No regression attributable to Pole G/merge: the
  lone 14.1 s decode is `helios_cradle.glb` (14.3 MB, unchanged since HEAD~8)
  and the single 404 page error appears identically in pre-Pole-G probe logs.
  Residual is still Pole A serial-admission throughput (upgradePending ~21,
  inFlight=1).

### Seventh round (head 7d8a5ace7 — master merge)

Merged master tip `391981fe1` (288 new commits incl. the parallel quiet-latch
perf series). Conflicts resolved: draw-flight check took master's version
(master `c448b94fa` rewrote the test for dynamic-stick semantics — the old
speed-window fix is obsolete), renderPackageManifest took master's canonical
regen.

- `sim` shard is now red on BOTH sides: the 47a golden moved to `f3583c50…`
  (byte-identical reproduction on master tip). `git bisect` across the merge
  range fingers master commit `182faf57b` ("INFERENCE-17 tail: authored
  command pushes honor the 128-ring; _spawnDue commits survivors on throw",
  touching src/systems/aiEncounter.js + aiPorts.js) — it changed sim behavior
  without reminting `test/47a.telemetry.expected.json`. Owner fix: mint the
  new golden on master (or revert); not our call to overwrite the expectation
  on a PR branch.
- static shards / feel / program-docs: same adjudicated master-side sets.
- `draw-flight` now runs master's rewritten contract — no branch-side
  involvement needed.

Focused node --test sweep over the touched modules at branch tip (far-actors,
time-effects, moment-detector, docking-corridor, hlod, entity-mesh-visibility,
authored-admission, audio-parameter-churn, pq146-projectiles, projectile-flight,
asteroid-pool ×3, asset-residency ×2, admission-slice-budget, bug-perf-sweep,
asset-loader ×2): all green except `asset-residency-refcounts`' "headless real
release-GLB traversal" — a Playwright-launched real-browser GLB traversal that
stalls identically on origin/master on this box (>8 min against a 120 s test
timeout; box-slowness in real asset decode, unrelated to the diff).

## Round 8 — merge-inherited stale render packages (regression found + fixed)

Post-merge probe on `86efa5239` read `missingFrames=2403 stuckMissing=2267`
vs master's `455/270` at the same box — a real merge interaction, not noise.
Root cause: the manifest conflict was resolved to master's
`renderPackageManifest.js` while the package binaries came from our side —
`check-render-package-pilots` flagged `apron-shuttle: render-package.json is
stale`, and at runtime every stale-pinned package is rejected, dropping 267
ships onto the slow per-part path → mass stuck-missing. Fix: full
`build-render-package-pilots` rebuild on the merged tree + manifest regen
(`cec0c22fe`). Post-fix probe: `missingFrames=199 stuckMissing=106
flightShaderLinks=20 (8 in-frame) appearOnTime=0.70` — envelope restored.

Merge-rule learned: any merge touching `assets/ships/release/render-packages`
or `renderPackageManifest.js` must be followed by a pilots rebuild — the
pins are content-hash pairs and either side's half-set is silently rejected.

## Round 9 — parallel lane fan-out (hill-climb swarm)

Nine subsystem lanes spawned as parallel child sessions off
`devin/1790392438-perf-pipeline` (+ electron lane landed earlier as
`devin/lane-electron`). Each explores its lane, implements one zero-visual-diff
leaf, pushes `devin/lane-<slug>`; winners merge here after probe A/B.

- `shaderwarm` (`cfd21b7b8`): keep-alive pipeline probes were minting the WRONG
  program keys — bare MeshPhysicalMaterials instead of the real
  `applyAuthoredMaterialProfile` + `canonicalizeAuthoredProgramState` chain, so
  first-flight authored admissions still compiled cold (the 19-20
  flightShaderLinks the probe sees). Probes now cover the real family-key
  space (Standard ×4 roles + transparent, Physical clearcoat/mechanical,
  transmission glass ±clearcoat) — 23/23 real authored combos hit a warm
  program in offline key-parity sim. A/B pending on this box.
- `admission`, `decode`, `batching`, `allocs` in flight; `simwalk`,
  `textures`, `postfx`, `hud` queued behind the org's session cap.

### Lane A/B adjudication

- `shaderwarm` `cfd21b7b8` — **reverted** (revert `2de602116`). Diagnosis
  correct (warm probes minted bare-Physical keys instead of the real
  `applyAuthoredMaterialProfile` + `canonicalizeAuthoredProgramState` chain),
  but A/B on this box showed no reduction: flightShaderLinks 20→22, in-frame
  8→9, aggregates within noise but strictly worse (519/282 vs 199/106).
  Link-subject diff shows real authored admissions (LOD0_engine_fan,
  Bourse_Carrier_Wreck, GLTFKit_*) still mint novel programs — the 23/23
  key-parity sim missed axes real assets carry (slot presence, env params,
  lightmap/vertex variants). Warm-up probe design must enumerate keys from
  REAL material state at admission, not the static role matrix. Lane notes
  preserved: canopy probes test-locked to pre-canon subsets; uncovered axes
  DoubleSide/alphaTest/vertexColors/tangent-less/mapless-breakup.

- `batching` `b103b393d` — **kept**. Memoizes the authored-chunk castShadow
  verdict behind `matrixSerial` + signed slack margin; provably-identical
  verdicts (equivalence harness 0 mismatches, ~99% of evaluations skip the
  rescan). Probe A/B: stuck 106→79, P99 275→261ms, appearOnTime flat.
- `decode` `c7671ad7f` — **kept (flagged)**. KTX2 worker pool 4→
  `min(8, cores-2)` + `ktx2.init()` kicked during runtime assembly. Direct
  metric improved: authored composition p95 5810→4555ms, max 7204→4248ms.
  Pop-in metrics read worse (245/138 vs 187/79) but inside this box's
  demonstrated ±2x noise envelope; possible CPU contention between decode
  workers and the render loop on software-GL — worth a hardware A/B.
  Follow-up noted by lane: shared cross-decoder pool budget.

- `admission` `98ea6cc45` — **kept**. Deadline-aware splice into the strict-FIFO
  entity-plan decode lane: admitted upgrade jobs jump queued ambient
  prefetch/runway/warm-up decodes (FIFO within each class, running task never
  preempted, serial bound and failure isolation unchanged). This was the
  plan's own named leftover. Probe A/B: appearOnTime 0.50→0.70,
  P99 330→242ms, flightShaderLinks 20→16, stuck 138→126; missing 271 vs 245
  inside noise. Lane notes: deeper prefetch lookahead is now safer to try
  with ordering fixed; whole-ship LOD demotion could also take the deadline
  flag.

- `textures` `0f16bf3ad` — **kept (work-removal only)**. Per-renderer WeakMap
  texture-upload version stamps in `prepareStartupGpuResidency` — the texture
  analog of the landed `spacefaceGpuResident` geometry stamp: repeat residency
  passes (admissions sharing decoded packages, pool seals, live-sector cooks)
  skip the yield slot + `initTexture` call per already-resident texture.
  Provably identical (three's own `version` gate already no-ops; stamps clear
  on context restore via `ignoreResidentStamps`; Video/External excluded).
  Probe read worse (452/295, P99 361) but inside this box's ±2x noise and the
  change only removes work — kept with a note that headless-box variance
  exceeds small CPU wins; the win shows up in residency-pass wall time.

- `allocs` `4fc52a614` — **kept**. Retained-scratch conversion of the per-tick
  propulsion packet path (~10-20 small allocs/craft-tick removed): kernel
  normalize* + governor functions write into module scratch with `out=`
  defaults preserved; flightV3 fills retained input/body/env/args packets with
  separate player/NPC scratches so player-only keys can't leak; the one true
  retention path (result.runtime) still copies. v3 sim hash bit-identical to
  base (c3fa7d52); legacy golden unchanged. Probe: stuck 295→150, links
  24→16 (in-frame 8→2); P99 tail 1534ms inside box tail-noise; flagged for a
  tail-latency re-check on hardware.

- `simwalk` `78fd174b3` — **kept**. Empty-payloads early-out on the two
  per-tick jettisoned-pod censuses in lawSecurity (NEAR clock): pods are only
  `type:'payload'` entities, so a live index with an empty payloads bucket
  proves the census produces nothing; skips the five-bucket index walk in
  `_updateCustomsScanCones` and the entityList walk in `_dwellWeirPods`.
  Mirrors `lootShards._catchPodsInNets`' existing early-out. Keeps the
  entityList walk verbatim when payloads is non-empty (bucket order diverges
  post-swap-pop — avoids an emit-order change). 47a golden bit-identical
  (f3583c50 on this box, matches post-merge baseline). Probe within noise.

- `postfx` `8e7463fae` — **kept**. Dead per-frame work in the bloom blit:
  `matrixWorldAutoUpdate` frozen on quadScene/quadCam (QUAD_VERT ignores
  transforms — skips a scene walk + 4x4 camera invert per blit), stencil-free
  rtScene clear (stencilBuffer:false made the stencil bit a spec no-op that
  still paid a setMask), `uGrainFrame` clock read gated behind grain>0.001
  matching the shader's own threshold. ~2-5µs/frame CPU; contract tests
  (bloom timing/guard, hotpath, perf-budget) green. Probe: stuck 286→182,
  missing 450→339, on-time 0.48→0.58. Lane documented the dry-tree list:
  renderBufferDirect bypass / CAS fold / sweep narrowing rejected.

- `hud` `c161e23fd` — **kept**. Removes the DOM touches a settled frame pays
  BEFORE the write-on-change gates: whole-write signature for
  updateShipCondition (~40 cached attr/text/opacity calls + String allocs
  skipped), JS-mirror text reads instead of textContent, latched dataset/
  class toggles via setAttr/_sfAttr, one-time element lookups (dock-alert
  query scoped to #alerts, reticle from in-scope node, body-class toggle on
  change), masslineCadenceReadout JS-side last-value caches with a hide() so
  caches stay authoritative. Probe: **best reading of the campaign** — stuck
  182→20, missing 339→74, appearOnTime 0.583→0.794, leftUndrawn 9→5.

## Fan-out scoreboard (10 lanes, parallel child sessions + VM A/B)

| lane | commit | verdict | headline |
|------|--------|---------|----------|
| electron | merge `86efa5239` | kept | GPU-power flags, v8 compile cache, no background net |
| shaderwarm | `cfd21b7b8` | reverted `2de602116` | wrong-key probes; no link reduction |
| batching | `b103b393d` | kept | memoized authored-chunk castShadow verdict |
| decode | `c7671ad7f` | kept (flagged) | KTX2 pool 4→min(8,cores-2), Basis warm early |
| admission | `98ea6cc45` | kept | deadline splice in serial decode FIFO |
| textures | `0f16bf3ad` | kept | texture-upload version stamps |
| allocs | `4fc52a614` | kept | retained propulsion packets, hash-identical |
| simwalk | `78fd174b3` | kept | empty-payloads census early-out, golden-identical |
| postfx | `8e7463fae` | kept | bloom blit dead work |
| hud | `c161e23fd` | kept | pre-gate DOM touches removed |

Final probe on merged tip: missingFrames=74 stuckMissing=20
appearOnTime=0.794 — vs post-merge-fix baseline 199/106/0.70 and the
pre-pipeline origin 819/596/0.595. All kept lanes are zero-visual-diff and
non-hash-moving (verified per-lane: sim goldens bit-identical on this box).
Residual lane notes (canopy test-locked probes, deeper prefetch lookahead,
cross-decoder pool budget, whole-ship-LOD deadline flag) are recorded in the
per-lane entries above.

## Round 10 — wave-2 lane adjudication (rolling)

| Lane | Verdict | Evidence |
|---|---|---|
| prefetch | **KEPT** `9efca8bd8` — depth-2 lookahead + deadline flag on LOD demotion + **fixed wave-1 deadline splice predicate (was inverted — flagged entries never spliced)** | merged `10097c85c`; probe 371/237/0.705 inside historical noise band (74–452 across runs); splice fix proven by lane's gated-lane harness (A,B,C → A,C,B order) |
| calendar | **KEPT** `05ede7d6` — intra-window sub-phase spread (~15-owner spike per cohort tick → 1–2 owners/tick); test-pinned anchors kept | merged `…`; **47a sim hash `f3583c50` bit-identical pre/post merge** (verified on-box) — output-equivalent; no remint needed |
| entitylist | Pole B demotion REJECTED (verdict holds — optic cells must stay in collidable/radar/spatial indexes; demotion starves classifyWorld rediscovery) | **KEPT** residual `cdb0a0966` — batch corpse removal via order-preserving filter (400-corpse wipe 2.08→1.46 ms); 47a hash `f3583c50` identical on-box |
| shaderwarm2 | **KEPT** `2205a5afe` — canonical-program specimen pool: one retained specimen mesh per (canonicalized material-state × object-axes) signature at the admission choke point; covered programs keep usedTimes≥1 across dispose/eviction; cap 512; kill switch `__SF_PROGRAM_SPECIMENS_OFF__` | merged; specimen-pool tests 4/4 on merged tree; render-side only (no sim-hash surface); wave-1 link-count A/B N/A on SwiftShader — adjudicated on construction + signature-equality tests |

### Round 10 CI adjudication addendum
- `sim-loot-audit` (new red on merged tip): **master-side** — identical `unique_mirrorjaw_pulse` unreserved issue, `definitionHash f00f64fa`, `rollHash c00e6f48` reproduced on origin/master `2259117e5` worktree. Not introduced by any lane merge.
- Master `2259117e5..c1208d79c` merged clean (0 conflicts, 0 render-package changes, pilots fresh 267); `63df33c89` owner-side combat-phase memoization included; 47a hash stays `f3583c50`. Owner claimed PQ-040/PQ-025 acceptance lanes on master — consistent with closure doc GATED verdicts.
| decodepool | **KEPT** `7992679b` — shared cross-decoder FIFO semaphore (cap `max(2, cores-2)`) over the two sole worker intakes (KTX2 `postMessage`, meshopt `decodeGltfBufferAsync`); idle capacity flows to whichever decoder has work; dispose reclaim + no-double-wrap guards | merged; node --check clean; harness-proven 7-section semantics; render-side only |
| shadowcast | **KEPT** `713dc74e` — `castShadow` becomes a prototype accessor on vendored three `Object3D` feeding a module-level caster registry; `WebGLShadowMap.render` (non-VSM) iterates it with parent-chain reachability re-proof + unchanged gates — kills the per-frame shadow DFS | merged; registry test 6/6 + 8000-case DFS-oracle fuzz 0 divergence; zero-visual (identical drawn set by construction) |
| memoff | **KEPT** `159f5440` — decoded CPU texture mirrors (KTX2 mips + `source.data`) freed after GPU-upload proof; contentHash-keyed manifest rehydrates SHA-256-verified re-decode on context restore before first render; shared-Source dedupe + clone-mark rejection | merged; detach suite 6/6 on merged tree; render-side only |
| lodrebuild | ~84MB artifact already fresh (267/267); **real defect found+fixed** `2ff14982` — demoted whole-ship LOD roots escaped `disposeObject`'s attached-only traversal, leaking GPU buffers/materials/pins per demoted ship; `disposeWholeShipLodRetained` boundary hook re-attaches stale roots into the dying traversal; `roots.lod0` rebind on re-admission | merged; node --check clean; swap-back cache preserved (zero visual diff) |
| marginmemo | **KEPT** `5ff4a0fd` — `cameraKeepOutTarget` per-frame solids census + `modelTruthSlideOutside` (per-solid `skinPrimitives` alloc storms) latched behind `entityIndexVersion`+`_meshesVersion` serials, signed slack in slide metric (1.35 planar bound provably ≥ `colliderRadiusAt` cap), near-point erosion, 0.25s wall TTL; real slide results never cached | merged; 12-scenario 0-divergence harness + 128k-angle slack sweep (worst margin 0.135) |
| gltfworker | **KEPT (viable subset)** `…` — GLB structural pre-pass worker: batch-decodes meshopt bufferViews + pre-slices embedded KTX2 bytes in one transferable round trip; stock parser assembles identical output; worker-death → caller re-reads (content-hash immutable); full worker-parse rejected (material param non-transferable) | merged; 46/46 + 4/4; byte-identical decodes on 0.02MB→82.5MB packages incl. helios hub |
| simattr (PQ-129.19) | **KEPT** `be9bec22` — opt-in `simAttributionEnabled` (default off): every sim step runs instrumented registry accumulating frame max+argmax+total; verdicts carry `simSystem`; frozen steps stay honest; ring writes stay on stratified sampler | merged; node --check clean; new tests in file 32/35 (3 preexisting host-load extraction reds identical on base) |
| progkeys (PQ-129.13/PERF-36/76/PQ-196 partial) | **KEPT** `90dffbf7` — card-rig env bake pinned to PMREM cubeSize 512 so fallback mints identical program keys to 2k equirect sources → env promotion is texture-only rebind, whole relink wave class eliminated | merged; live census A/B: 101→97 unique programs, 122→118 shaderLinks, all envMapCubeUVHeight=1024 keys gone; space-reflection tests 2/2 |
| glflags (PERF-69/70/92) | **KEPT** `ac8166c1` — real `alpha:false` opaque WebGL2 context (compositor skips blending; pixel-identical: bottom layer, always opaque clears); stencil:false pin; ANGLE `d3d11` win32 pin + `SPACEFACE_ANGLE_BACKEND` allowlist override (kills field-trial drift); REJECTED: desynchronized (tear risk under DOM overlays), frame-rate-limit disable (breaks 60Hz) | merged; node --check clean; probe --compare PASS (stuckMissing 265→161, shaderLinks flat) |
| audiocull (PERF-65) | **KEPT** `c2540dcc` — combat-bus tracked loops culled at creation past TABLE_HEARING_FAR (~613 WU, same law as one-shots); preserved loops culled ≥0.5 s release node graphs + re-arm on re-entry; bomb field/status wanted-sets distance-gated; duck writer stops double-writing positional-composed loops | merged; node --check clean; 102 audio tests pass (4 reds identical on stashed base) |
