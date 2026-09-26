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

### Pole C — calendar tick straddle — LANDED (82da377ed)
Cohorts of index%3 in CALENDAR_CLOCK_IDS phase onto tick%30 ∈ {0,10,20}. Turned out
**not** hash-moving: the 47a golden runs the legacy47a profile, which walks `all`
every tick — straddle is production-only, `check:sim` reproduces `f542e2e9` exactly.
Test updated to pin cohort phase + wake-runs-all semantics.

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
- **Stale whole-ship-LOD release artifacts ship uncompressed** — census (2026-09-26):
  53 raw GLBs under `release/parts/wholeships/` (~70 MB; wasp lod1+lod2 alone ~25 MB,
  15 raw PNGs each). Of these, 23 are manifest-managed `wholeship_*_lod*` entries whose
  manifest rows claim ktx2+meshopt but hold byte-identical copies of the raw source
  (`sourceSha256 === releaseSha256`); the other 30 are orphaned `*_production_v1` family
  exports referenced by neither manifest nor code (sources stay in `parts/wholeships/`).
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

Focused node --test sweep over the touched modules at branch tip (far-actors,
time-effects, moment-detector, docking-corridor, hlod, entity-mesh-visibility,
authored-admission, audio-parameter-churn, pq146-projectiles, projectile-flight,
asteroid-pool ×3, asset-residency ×2, admission-slice-budget, bug-perf-sweep,
asset-loader ×2): all green except `asset-residency-refcounts`' "headless real
release-GLB traversal" — a Playwright-launched real-browser GLB traversal that
stalls identically on origin/master on this box (>8 min against a 120 s test
timeout; box-slowness in real asset decode, unrelated to the diff).
