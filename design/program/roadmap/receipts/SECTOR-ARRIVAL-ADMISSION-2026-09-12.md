DONE the defect — jumping Helios → Ceres no longer arrives in a sector that never publishes anything. NOT DONE the +5 s / +20 s bar on a live jump, and NOT DONE the still.

DONE WHEN (verbatim, from the lane brief): "Prove it on the real GPU with the probe: `station:ready` (and every ship/pod within 340 WU ready) by +5 s, at worst +20 s, both via the jump and via `--teleport`. Then a headed still at the shipping camera on arrival at Ceres showing the station: Read the PNG yourself, describe it in words in the receipt, delete it."

Against that wording: the categorical defect is fixed and proven on the gate, `--teleport`, `--continue` and inside-the-opening-window paths. The **+5 s / +20 s** timing is met on Continue only; a live jump lands at +45 s to +90 s on the reference GPU. The **still** shows no station and no player hull, for two measured reasons that are not this defect. Both are itemised under UNPROVEN with numbers.

WHAT I FOUND — Three causes stacked on the same symptom, and only the first was known.

1. **The guards never lift after a jump.** `prepareLiveSectorAfterJump` ends by re-applying the OPENING's two publication guards (`holdAuthoredUpgradeQueueForFirstFlight` + `freezeOpeningGraphPublication`). The only thing that lifts them is the opening's one-shot latch, armed by `mode:changed -> 'loading'` and fired once by `prepareFrame`. A gate jump never returns to loading, so after the opening had fired that latch the guards were permanent: every authored body materialized in the arriving sector prepared and then parked at `presentationAdmission: 'pending'` for the session. (Found by the predecessor lane; its draft was uncommitted in the tree.)

2. **Re-arming the latch on its own made a second, quieter deadlock.** That latch is also the session's only call to `resumeDeferredPipelineAdmissions({ force: true })`. Firing it 1.5 s after arrival landed it inside `shouldDeferPipelineAutoFlush`'s first-flight hold, and `resumeAutoFlush()` in that state sets `boundedResume`, clears the quiet/max timers, and returns — leaving the bounded-resume compile lane armed with no timer and no caller. The only thing that could ever wake it again was a *new* `compile()`, and the next authored job was itself waiting on the compiles already queued. Measured on the real GPU: three compiles sat unflushed from sim 4.2 to sim 47.9, 32 boundary preparations stuck at `PREPARING`, one upgrade job stuck at `running`, nothing at the destination ever `ready`. This is reachable only when `preparePostOpeningPipelines` never sets `_postOpeningPipelineAdmissionReleased` — on the reference Intel iGPU the opening logs `GPU resources incomplete`, so it does not; a healthy opening likely never sees it.

3. **The destination station was not in the hulls-only cook cohort.** `isLoadingHullUpgradeJob` admitted `ship` and `place` but not `station`, so the hulls-only pass skipped the biggest authored body in the sector and left it behind the leftover-FX hold. (Predecessor's fix.) On the jump path this stayed invisible while cause 2 held the compile lane dead. On the Continue path the lane was never dead — `mode:changed -> 'loading'` runs `resumeAuthoredUpgradeQueueForLoadingHulls` behind the loading shell and a restored clock is already past the release gate — so this cohort filter is the likely reason Continue publishes at +5 s. Likely, not proven: the console tail printed `first-flight cook {entities: Array(9)}` without the per-entity list.

WHAT I CHANGED — A sector arrival now re-arms the publication release against the arrival clock, but never earlier than the opening's absolute first-flight window, so the one forced pipeline resume can never be spent while the auto-flush policy is still holding — the two now read the same constant. The bounded-resume compile lane treats that hold as a delay instead of a cancellation: it polls across it rather than going dead. Stations join the hulls-only cook cohort. Nothing was removed: both guards, the cook, and the leftover-FX hold all still run, and no fallback box is unhidden while a body is preparing.

WHAT YOU WILL FEEL — Fly the gate to Ceres and the place fills in: the jump ring and the sector's authored bodies arrive instead of the sector staying an empty rock field for the rest of the session. It is still slower than it should be on a weak laptop GPU — the arriving sector publishes as one set, so you wait for the whole population rather than for the nearest thing — and the ship you are flying is drawn in the wrong place after a jump, which is a separate defect named below.

THE NUMBERS

Headed Chrome, real GPU (ANGLE / Intel(R) Graphics 0x00007D45, D3D11), seed 4242, `node scripts/probe-sector-arrival-admission.mjs`. Subject: station id 189 (`place_gate_jump_ring`, tier `R0_GLASS`), 207 WU from the arrival point — the only authored body inside the 340 WU census.

| Bar | Before | After | Target |
|---|---|---|---|
| Gate jump, station admission at +5 / +20 / +45 s sim | `pending` at every sample | `pending` at every sample | ready |
| Gate jump, station admission by +90 s sim | `pending` (and forever) | **`ready`**, `authoredAssetState: authored` — landed at +60 s in one of three runs and +90 s in the other two | ready |
| `--teleport` (`world.enterSector`), +45 s sim | `pending` | **`ready`** | ready |
| `--continue` (quick save at Ceres, reload, Continue), +5 s sim | not previously measured | **`ready`** at the first sample | ready |
| Stress `--jump-at 0` (arrival inside the opening window), +90 s | `pending` (and forever) | **`ready`** | ready |
| Authored boundary preparations at the destination | 32 stuck at `PREPARING` for the whole session | 32 → 0, all `authored-prepared`, drained sim 33.6 → 84.3 | drain |
| Pipeline admission queue (`pendingPipelineAdmissions`) | 3 unflushed, sim 4.2 → 47.9, no timer, no caller | drains; 0 at settle | 0 |
| Authored upgrade queue depth at the destination | 35 pending, 1 job `running` forever | 35 → 0 | 0 |
| Ships/pods within 340 WU | none in range this seed | none in range this seed | — |

Sim-clock reading of the same run (`--diagnose`): the arrival re-arm sets `firstFlightDeferredHoldUntil` at the end of the cook and `prepareFrame` clears it 1.5 s later; `openingGraphPublicationFrozen` goes `true → false` at that mark, and the queue starts draining on the next frame.

THE FEEL — Arriving somewhere and finding the place actually there is the difference between a jump and a teleport into a void. It is fixed, and it is still too slow to feel like arrival on a weak GPU: the sector lands as one lump around a minute in rather than the near body appearing first.

CHECKS

| Command | Result |
|---|---|
| `node --test test/sector-arrival-publish-release.test.mjs` | PASS 9/9 |
| `node --test test/late-pipeline-admission.test.mjs test/opening-admission.test.mjs test/post-opening-pipeline-admission.test.mjs test/render-target-pipeline-warmup.test.mjs` | PASS 62/62 |
| `node --test test/check-ci-report.test.mjs` | PASS 30/30 |
| `node scripts/check-ci-report.mjs --list-groups` | 0 unclassified; the new check lands in the `browser` group |
| `node --test test/presentation-world.test.mjs test/opening-mesh-defer.test.mjs test/opening-gpu-admission.test.mjs test/first-flight-gpu-hold.test.mjs test/authored-software-renderer-readiness-gate.test.mjs test/live-whole-ship-admission.test.mjs test/compile-present-slice.test.mjs` (with the new test) | PASS 99/99 |
| `npm run check:baseline` | **15/15 green** on a clean machine (148 s). An earlier run taken while a headed probe was live showed 14/15, with `check:47a:physical-branches` TIMED OUT at 150.6 s against a 150 s budget; run on its own it printed `47-A physical branches OK`. Contention, not an assertion |
| `node scripts/probe-sector-arrival-admission.mjs` (gate) | PASS, published at +60 s / +90 s / +90 s across three runs |
| `node scripts/probe-sector-arrival-admission.mjs --teleport` | PASS, published at +45 s |
| `node scripts/probe-sector-arrival-admission.mjs --continue` | PASS, published at +5 s (the quick save was asserted written in `sector_ceres_belt` before the reload) |

Wiring: `check:sector-arrival-admission` runs the probe and sits in `check:art` immediately **before** `check:assets:live` (which has its own long-standing red), so the group reaches it; `check:all` expands composite chains into independent leaves, so it runs there regardless of order. It is registered as a `browser` leaf in `scripts/check-ci-report.mjs` so the partitioned CI matrix puts it in the job that has Chromium (`--list-groups` reports 0 unclassified).

The probe asserts the categorical bar — every admitted body inside 340 WU is published within the budget — and stops at the sample it lands on, printing `PUBLISHED at +Ns` plus a `WARN` whenever that is past 20 s. The assertion catches "the arriving sector publishes nothing"; the printed sample is the speed number to watch.

UNPROVEN

- **The +5 s bar is met on Continue but not on a live jump, and the still is not delivered.** Continue publishes at the first sample because the loading path cooks the destination behind the shell before flight begins. A live jump does not, for two measured reasons. (a) The arriving sector publishes as one certified set — the prewarm's population fixpoint settles every staged boundary before publishing any of them — and authored admission is serial in flight (`AUTHORED_UPGRADE_STEADY_LIMIT = 1`), so 32–35 bodies at roughly 1.4 s each on this iGPU means the destination lands at +45 s to +90 s on a live jump, not +5 s. Nothing in this unit's change affects that ordering; making the nearest body publish ahead of the set is a separate packet. (b) A shipping-camera still at arrival shows an empty field even with the station `ready`: the station is 207 WU out and the shipping camera shows roughly 144 WU, so it is off-frame by design, and the player's own hull is not drawn because its mesh pose is stale after a jump — see the handoff below. I read the still myself: dust band across the upper-left, deep starfield, a hazy blue nebula at lower-left, full HUD with `Gate → Helios Prime · PICK · 66% · READY`, and no ship or station in frame. The same capture at Helios before the jump shows the player hull, a ringed gas giant, an asteroid and traffic, so the renderer is not broken in general. Stills were read and deleted.
- **Separate defect, handed off (not this unit, and its files are live foreign work).** After a gate jump the player's mesh is not at the player's sim pose. Measured at +95 s sim, standing still at Ceres: player sim `(-9629, 6279)`, frame membrane origin `(-8192, 8192)`, so the correct local pose is `(-1437, -1913)`; the camera is at local `(-1436, 110, -1977)` (correct), but the player mesh sits at local `(1187, 0, -3634)` — 3104 WU from its own camera — while reporting `visible: true`, `authoredAssetState: 'authored'`, attached to the Scene. Station 189's mesh is placed correctly (local `(-1230, -1910)`, 243 WU from the camera). `presentationWorld.duplicateIdRejects` and `staleHandleRejects` are both 0, so the mirror is not rejecting the record — the pose write itself is wrong or frozen. The seam (`presentationWorld.js`, `persistentSubmitLanes.js`, `entityViewSyncBand.js`, `entityMeshVisibility.js`) all carry another writer's uncommitted hunks, so I did not touch it.
- **One Ceres ship reaches `unavailable` instead of `ready`.** Three of the after-runs end with `ship:unavailable: 1` in the sector-wide tally at +90 s, and an earlier console tail carried `[partsLibrary] authored composition failed; no substitute visual published — AggregateError: Authored ship pipeline admission failed`. It is outside the 340 WU census so it does not touch the assertion. Before the fix nothing at Ceres reached admission at all, so this is newly **visible**, not proven newly **caused**; it needs its own look with the entity id.
- **The wired check does not enforce the +5 s / +20 s bar.** `check:sector-arrival-admission` asserts publication within 120 s — the categorical "the arriving sector publishes nothing" regression — and prints `PUBLISHED at +Ns` with a `WARN` past 20 s as the speed number. Tightening the assert is the follow-up packet's job, once the near body publishes ahead of the set.
- **The probe is headed by default**, like `check:gpu-path` and `check:perf` which are already in the matrix. I did not verify that the CI browser job has a display; `--headless` exists for triage.
- **The run70 Intel hitch on the new +1.5 s release is not proven absent.** The release now fires 1.5 s after an arrival instead of at the absolute 20 s mark, running the same flush shape the opening runs. No brick or context loss appeared in any of the seven headed runs on this Intel/ANGLE box, but that is observation, not a hitch measurement.
- `src/render/partsLibrary.js` carried **no** foreign hunk when I diffed it (the lane brief expected one): its only working-tree change was the predecessor's station-cohort line, so the commit is exact rather than an adoption. `src/render/renderer.js` likewise carried only the predecessor's draft.
- Foreign uncommitted hunks in `src/render/authoredAdmissionPolicy.js`, `compilePipelinesSafely.js`, `engineTrailSurfaces.js`, `entityMeshVisibility.js`, `liveSceneCook.js`, `openingGpuAdmission.js`, `persistentSubmitLanes.js`, `precompile.js`, `presentationWorld.js` and `src/core/presentationAdmission.js` were preserved untouched and are not in the commit.

## Third pass — orchestrator, 2026-09-12 (after lane R3 landed 19d19d42e)

WHAT I FOUND — With nearest-first admission in place the jump ring 207 WU off the bow was composed by +5 s but still sat `pending` until +20 s (wired check: WARN past 5 s, once FAIL past 20 s under load). `--diagnose` at +5 s: `firstFlightResidencyHoldUntil` = arrival + 20 and `meshCount` 1. The flight-mode `sector:enter` branch arms the OPENING's 20 s residency hold after `compileSectorPipelines`, and that hold returns `held-first-flight` from the mesh reconcile, so nothing arriving can bind a mesh until it expires.

WHAT I CHANGED — In flight (a gate jump or a direct sector enter, where the destination is already cooked) the hold is `SECTOR_ARRIVAL_PUBLISH_HOLD_SECONDS` (1.5 s), the same settle the publication release uses; the opening keeps its 20 s.

THE NUMBERS (seed 4242, Helios → Ceres by gate after 25 s of flight, Intel iGPU, machine otherwise idle)

| Bar | Before | After | Target |
|---|---|---|---|
| gate ring `ready` (wired check sample) | +20 s (WARN), +45 s under load | **+5 s**, PASS with no WARN | +5 s |
| per-second timeline (scratch probe): publication release fired | never before +20 s | sim +4.1 s after the sector change (cook 2.5 s + 1.5 s hold), ring `ready` at +5 s | — |
| an early jump (before sim 20) | ring at +16 s (absolute sim 20) | unchanged: the arm keeps `max(arrival + 1.5, 20)` | opening settle owns it |

STILL OPEN — the player-hull pose after a jump (lane R2's measurement, files carry another writer's uncommitted hunks incl. `PERSISTENT_LANES_ENABLED` flipped to true) is not verified either way here.

HULL POSE AFTER A JUMP — RESOLVED (orchestrator, same day). Measured with the renderer's own mesh map (`registry.get('render')._meshes.get(playerId)`) on the 25 s gate route: at +2 s the player's mesh still sat in the departed sector's origin frame (mesh (-55, -1) vs camera 11,410 WU away) — that is the window the arrival cook holds the picture frozen; by +5 s and +12 s the mesh is 64 WU from the chase camera at (-1437, -1913) with the jump ring's mesh 207 WU from it, exactly the sim distances (the scene re-origins by (-8192, +8192) on arrival). Lane R2's "hull 3104 WU from its camera" was that transient, not a persistent pose-mirror defect. No change made; the uncommitted `PERSISTENT_LANES_ENABLED` flip stays uncommitted and untested.
