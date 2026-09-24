# IMPORT_DIGEST report — 20260926a (post-#165; **#166 ship** render-package-digest-zero-copy + **#167 ship** embedded-ktx2-single-copy)

Master tip: **`97c88f92b`** (fetched; unchanged since digest 20260924ea). No restack needed, and no vm-drop package has been imported since dz.

## #166 pass — summary (NEW)

A new pole: main-thread copies of streamed GLBs. In a bare-master 45 s profile
(10–30 s flight window) every streamed render package was copied **three times**
on the main thread:

| Copy | Where | Cost |
|---|---|---|
| Digest-worker copy | `renderPackageDigest.js` `view.slice()` | 204 ms / 60 bursts in the heavy-streaming run |
| Vendor GLB body copy | `GLTFLoader.js:1885`, `GLTFBinaryExtension` | ~214 ms |
| Embedded-KTX2 second copy | `embeddedKtx2Textures.js:103` | ~200 ms / 52 bursts |

`loadBufferView` adds another ~147 ms of vendor copies. No earlier vm-drop
package touches renderPackageDigest, renderPackageLoader or embeddedKtx2.

- **SHIP #166 `render-package-digest-zero-copy`.** The fetched buffer is
  transferred to the digest worker, which transfers it back with the hex. No
  copy on either thread.
  - Live 45 s interleaved A/B (3+3 runs): main-thread digest lane
    **11.7 / 17.7 / 10.7 → 1.1 / 0.8 / 0.8 ms**. Median ~14.6×, floor ≥9.7×.
    The 2–9 ms per-package bursts are gone.
  - Isolated lane: ~6× at 1 MB, ~26× at 4 MB, ~39× at 8 MB, ~57× at 16 MB.
  - Fallbacks: a lost worker triggers a re-fetch; an error reply is hashed on
    the calling thread.
- **SHIP #167 `embedded-ktx2-single-copy`.** A plain KTX2 bufferView is sliced
  once, straight off the GLB body, instead of bufferView slice + `slice(0)`.
  - Bytes are identical across all 259 render packages.
  - Lane 1.9–2.1× at 1–8 MB, floor 1.39× at 16 MB.
  - Real-GLB parse of the 10 most KTX-heavy packages: **55.6 ms median
    removed** (52–75 ms; ≈0.29 ms/MB of KTX2; ≈5.6 ms per heavy package;
    whole parse 1.12–1.17×).
  - Embedded KTX2 is 502.6 of 695.5 MB of all render packages.
  - Not separable in the quiet 45 s live windows, which streamed only small
    packages. This is a heavy-admission hitch cut.
- **Focused suite (67 files):** patched 395/424, bare master 389/418. The
  **identical pre-existing failure set** (28 fail + 1 cancelled) appears on
  bare master, e.g.:
  - packaged-Electron closure
  - Kestrel V6
  - opening remaster identity
  - faction kits
  - refinery promotion
  - render-package pool admission (323–343)
  - "all 74 release bodies"
  - PQ-131.06 conduit

  Earlier-noted bare failures still stand: loop-orchestration-perf 2,
  m1-player-tell-hud 1, performance-lifecycle-manifests 1,
  civilian-freighter-recovery 8, pq-141-03-ambush-flee-spill 1.

### Holds this pass

- **sg02 Rapier call diet** (priority 1): retained RawVector setters plus a
  skip of wakeUp/isSleeping on never-sleep bodies. Poses are bit-identical
  over 2400 mixed ticks, but it is **below bar**:

  | Measurement | Result |
  |---|---|
  | Node owner bench | 1.19× |
  | In-page | 1.09–1.13× |
  | Live | ~0–8 µs/tick (noise) |

  Getters (~260 ns each, allocating) can only be removed by the excluded
  prestep carry. **HOLD:** `sg02-rapier-call-diet-hold/`.
- **Early-flight tacticalAI** (priority 2): the #164 0–10 s spike (~0.95
  ms/tick) was a one-off combat/capital-boss scenario. Fresh reruns give
  ~3–10 ms/s on both stack and bare, and `_contactBaseFor` is already cached
  per tick. **Not a pole.**
- **radar.draw residual** (priority 3): bare ~97 ms/30 s at 10 Hz. The
  remaining retain angles need the unimported #156/#158 still-layers, and the
  animated glyphs carry picture risk. **SKIP.**
- Thin: `assetResidentBytes` (~13 ms/30 s), `canonicalizeSurfaceProgramFamilyKey`
  (~15 ms/30 s), `prefersReducedMotion`/`updateObjectiveKey` (a few µs).

### Largest remaining costs → next poles (ranked)

1. three render CPU (`drawPreparedFrame` ~55 ms/s + `updateMatrixWorld` ~10.6 ms/s). **Owner side** (batching).
2. Bloom `checkProgramsReady` → `isProgram` / shadow-sweep program links, ~5.1 s of main thread in the first 15 s. Admission pole, **owner/GPU side**.
3. Vendor GLTFLoader copies: GLB body `data.slice` (~214 ms) + `loadBufferView` (~147 ms) per heavy streaming window. **Owner/vendor side.** A local plugin could hand geometry views as subarrays, but that changes the vendor cache semantics.
4. sg02: getters need the carry decision; diet + carry is estimated at ~1.35–1.45×. **Owner decision.**
5. Gamepad poll gating and tether acquisition preview. Held (input/gameplay risk).

VM-side portable sim work is **nearly exhausted**. The registry latch vein is
done, sg02 glue sits below bar without the carry, and the tacticalAI spike does
not reproduce. What remains big is owner-side: render CPU batching, program-link
admission, vendor loader copies, and the sg02 carry decision.

## Previous digest header (20260924ea)

IMPORT_DIGEST report — 20260924ea (post-#163; **#164 ship** hull-integrity-quiet-latch + **#165 ship** perf-heap-sample-gate)

Master tip: **`97c88f92b`** (fetched; unchanged since #161 / digests 20260924dx / dy / dz). No restack; no vm-drop package imported since dz.

## #164 pass — summary (NEW)

- **Registry latch vein exhausted.** survivorPod has 0 promoted pods in the
  live game (helios_prime, 4 payloads). survivorPod, scanner, bulletTime,
  fieldDepletion and masslineThreats are all ≤~0.44 µs/tick warmed. None is
  packaged. **Do not keep mining per-system registry.step latches.**
- I re-profiled the whole quiet frame and the admission poles on bare master
  and on the full digest stack (local `vm-work/stack-20260924u`, #31–#163 on
  `97c88f92b`). Fresh cost map:
  `hull-integrity-quiet-latch/artifacts/cost-map-164.md`.
  - Stack settled sim: ~0.86 ms/tick (bare master ~1.23).
  - Idle: 70.1% (bare 54.8%).
  - Long tasks: 4 (bare 12).
- **SHIP #164 `hull-integrity-quiet-latch`:** skips the settled HUD
  `updateShipCondition` DOM compare pass.
  - In-page median **21.2×** tight / **10.1×** per-frame, floor **≥8.6×**
    (5 isolated Electron runs, JIT-warmed).
  - ~55 µs/frame removed. Live profile 0.83 → ~0.1 ms/s.
  - Live-change path at parity.
- **SHIP #165 `perf-heap-sample-gate`:** `performance.memory` is read only
  while Tier-1 counters are live. **~52 µs/frame** removed (50–61 across
  5 runs). Live profile `get memory` 0.68 → 0.00 ms/s.
- Focused am-verify: **455/459**. The same 4 failures occur on untouched
  master:
  - `loop-orchestration-perf` 2
  - `m1-player-tell-hud` 1
  - `performance-lifecycle-manifests` 1

  Core suites (hull-integrity, perf-counters, hud-flight-attention,
  presentation-runner) are **121/121**. Previously noted bare-master failures
  are unchanged: `civilian-freighter-recovery` 8 and
  `pq-141-03-ambush-flee-spill` 1.

### Largest remaining measured costs (full stack, settled, soft-GPU)

| # | owner | cost | kind |
|---:|---|---:|---|
| 1 | three render CPU (`drawPreparedFrame`) | ~55 ms/s (+ scene `updateMatrixWorld` ~10.6 ms/s) | presentation (pole 3 batching) |
| 2 | physics sg02 | ~0.21 ms/tick; JS glue in `_stepFixed` ~0.08 ms/tick (≈9 RawVector-allocating Rapier getter/setter calls per body per tick) | portable sim |
| 3 | early-flight tacticalAI (0–10 s) | ~0.95 ms/tick (`liveFramesFor` → `entityContacts` / `_contactBaseFor` + classify) | portable sim spike |
| 4 | opening shadow-sweep program links (`rehearseScenePass`) | ~1.0 s once at ~10–15 s | admission pole 2 (fewer keys; soft-GPU) |
| 5 | flightV3 / tacticalAI settled / fields | ~80 / ~76 / ~48 µs/tick | portable sim |
| 6 | gamepad `getGamepads` every tick | ~13 µs/call | input |
| 7 | radar.draw residual / tether acquisition preview | 2.8 ms/s / ~72 µs per 12.5 Hz refresh | HUD |

## Stack refresh

Portable scour branch `vm-work/hillclimb-20260924t` @ bare `origin/master`
`97c88f92b` + #160 + #161 + #162 + #163 (`/workspace/spaceface-scratch/hillclimb-20260924p` tip
`f3008ec52`). Prior #162 scratch tip `4d137d720` remains on the same branch
lineage. Stacked WIP remains on `vm-work/hillclimb-20260924o` @
`2911f4458` (trust-sleep — not packaged) `/workspace/spaceface-scratch/hillclimb-20260924h`.
No restack needed (master tip unchanged). Profile cite remains
`settled-45s-stacked-20260924ac` (+ `settled-20s-stacked-20260924ad`
cross-check; Picture ON, soft-GPU; tip through #64).

### Already on stack (do not rediscover)

| # | Package |
|---:|---|
| 31–162 | (unchanged — see digest 20260924dy / dx / dw / …) |
| 163 | `combat-outcome-quiet-latch` (~2.05× @30k / ~2.38× @100k median; ≥1.80× floor quiet flee-scan) |
| **164** | **`hull-integrity-quiet-latch`** (21.2× tight / 10.1× per-frame median; ≥8.6× floor; ~55 µs/frame) |
| **165** | **`perf-heap-sample-gate`** (~52 µs/frame `performance.memory` read removed while Tier-1 off) |
| **166** | **`render-package-digest-zero-copy`** (live digest lane ~14.6× median, ≥9.7× floor; 2–9 ms per-package bursts removed) |
| **167** | **`embedded-ktx2-single-copy`** (lane 1.9–2.1×, floor 1.39×; −55.6 ms per 10 heaviest packages; bytes identical) |

Including already-packaged but **not yet on master** (do not re-ship):
`combat-table-pose-incremental` (~4.78×), `stamp-near-work-awake-cache`,
`stamp-near-work-budget-early-exit`, `prestep-movables-trust`,
`lifetime-sweep-quiet-clocks-skip` (#143), customs cones / sanctuary /
combat pre+postPhysics (#145–#155), classify flying-rock / frame / early
parked latches, `sync-entity-views-closure-gate`, `micromotion-settled-skip`,
`hull-scorch-quiet-live-skip`, `countermeasures-quiet-empty-latch`,
`overlay-quartet-quiet-empty-latch`, weapon-light / rcs-impulse / ribbon /
arcade-structural / distortion / quarks / discharge / presenter-composite,
`radar-asteroid-still-layer` (#156), `sync-entity-lod-retain` (#157),
`radar-contacts-still-layer` (#158), `shield-bubble-quiet-latch` (#159),
`faction-presence-quiet-latch` (#160), `ai-encounter-quiet-latch` (#161),
`difficulty-director-quiet-latch` (#162), `combat-outcome-quiet-latch` (#163), **`hull-integrity-quiet-latch` (#164)**, **`perf-heap-sample-gate` (#165)**, etc.

### SKIP / hold (unchanged + this pass)

Carry forward all holds from digest 20260924dz / dy / dx / dw / dv / du / dt / ds / dr / dq / dp / do / … / da / cz.

**#164 pass — NEW:**
- **SHIP #164** hull-integrity quiet latch and **SHIP #165** heap-sample gate
  (presentation-thread HUD / perf residuals, not soft-GPU fps).
- **scene-matrix-retain** (dirty-compare replacement for
  `scene.updateMatrixWorld`) — **HOLD.**
  - Node microbench: 1.17–1.33× (floor ~1.0–1.23×).
  - In-page: 1.59× only *without* external-world-write validation. With the
    16-element validation that correctness requires (detach, standalone world
    update, re-add), it is **0.66×** (slower than stock).
  - Note: the Scene has `matrixWorldAutoUpdate=false`.
- **sg02 prestep kinematic carry** (reuse post-step linvel/angvel/yaw in
  `_captureExpectedKinematics`): ceiling hack only ~1.2–1.3× on the owner
  step (~60 µs/tick for 11 craft). **HOLD.** The real lever is a Rapier
  getter/setter diet (see next poles).
- survivorPod (0 live promoted pods) / scanner / bulletTime / fieldDepletion /
  masslineThreats: ≤~0.44 µs. **Thin; latch vein exhausted.**
- Gamepad `getGamepads` every tick (~13 µs/call): event-gated polling risks
  input behavior. **HOLD / next pole.**
- Tether `_refreshAcquisitionPreview` (~72 µs per refresh at 12.5 Hz) +
  masslineHud preview DOM: gameplay-rich receipt logic. **HOLD.**
- Opening shadow-sweep link burst (~1 s): pole 2 program-key reduction, not a
  VM latch. **HOLD (owner-GPU).**

**#163 pass:**
- **registry.step NEW shipped:** combatOutcome quiet-latch (#163) — 4-tick shipLike flee-scan.
- Fresh ungated scour (probe-162c ranks after combatOutcome): masslineThreats ~0.60 µs cold → ~0.16 µs warmed (no-tether inactive early-out already; thin — not packaged), survivorPod ~0.44 µs (promotedByPoint walk + causal tick; next candidate), scanner ~0.44 µs, bulletTime ~0.42 µs (flag path; thin), fieldDepletion ~0.39 µs — **all below ~0.5 µs abs; not packaged this pass**.
- Pre-existing bare-master failures noted (not caused by #163): `civilian-freighter-recovery` 8 fail, `pq-141-03-ambush-flee-spill` 1 fail.
- mining / sectorSim / encounterDirector / economy / fair-aiPorts / packCombat / stampNear / lifetime / classify / trust-sleep / law / traffic / bandRadio / quiet-VFX / pickup magnet-skip / objective idle — **not retried** (held).

**#162 pass — NEW:**
- **registry.step NEW shipped:** difficultyDirector quiet-latch (#162).
- mining settled abs ~0.26 µs (after heat/noise cold) — **thin; not packaged**.
- sectorSim quiet-skip vs ensureState ~1.09× — **below bar; not packaged**.
- encounterDirector early ~0.4 µs thin (1 Hz) — **held** (unchanged).
- fair-aiPorts / packCombat pose-incremental / stampNear / lifetime — **not
  rediscovered**.
- classify / trust-sleep / law / traffic / bandRadio / flying residual /
  quiet-VFX / pickup far-idle magnet-skip / objective idle deepen —
  **not casually retried** (held).
- syncEntityViews updater residuals / closure-gate / micromotion / LOD /
  shield-bubble / factionPresence / aiEncounter — **not rediscovered**.
- economy 5 s cadence quiet residual ~0.1 µs — **thin**.

## Quiet CPU / hitch profile (stacked tip cite)

Tool cite: fresh `settled-45s-stacked-20260924ac` (Picture ON, soft-GPU; tip
through #64 @ `e1b3f26a3`). Idle **65.2%**. Long tasks **17**. Soft-GPU /
native GL / bloom admission owners ignored for portable ranking.
Cross-check `settled-20s-stacked-20260924ad`.

### Top portable src/ self (aggregated) — climb targets

| samples | owner | notes |
|---:|---|---|
| 323 | `registry.step` | residual after …+#162; fair-aiPorts held; packCombat only if not pose-incremental / single-dirty; **imported packCombat/stampNear/lifetime not yet on master** |
| 269 | `classifyWorld` | residual after …+#141; **flying residual over parked ~1.3×**; flying-early-latch held; NPC/disc-admission still thin |
| 202 | `syncEntityViews` | residual after …+#157+#159; closures / microMotion already packaged — hunt fresh pickup/ordnance/infra **updater** residuals only if abs clears thin band; asteroid settled + render-entity-frame retain held |
| 186 | `prepareFrame` | residual after …+#126 (quiet-VFX floors still held; many quiet-live pools packaged, not on master) |
| 132 | `hud.frame` | residual after #156+#158; objective idle deepen thin; further HUD NEW only if ≥1.5× |
| 111 | `preStep` | **trust-sleep held (bare-master ~1.24×)**; remasure after packCombat+stampNear imports |

## New packages this pass

| # | Package | Evidence |
|---:|---|---|
| **164** | **`hull-integrity-quiet-latch`** | Settled HUD DOM compare pass skipped; in-page 5 isolated Electron runs: tight **21.2×** median (floor 11.4×), per-frame **10.1×** (floor 8.6×), live-change parity; 6000-frame picture-identity test; focused **455/459** (4 pre-existing bare-master); am-verify `ae3f81c0f` |
| **165** | **`perf-heap-sample-gate`** | `performance.memory` read gated on Tier-1: **~52 µs/frame** removed (50–61); live profile `get memory` 0.68 → 0.00 ms/s; am-verify `330d70d7a` |
| **166** | **`render-package-digest-zero-copy`** | zero-copy worker digest lane: live main-thread digest 11.7/17.7/10.7 → 1.1/0.8/0.8 ms per 45 s (~14.6× median, ≥9.7× floor); isolated 6–57× @1–16 MB; am-verify `27e34501e` |
| **167** | **`embedded-ktx2-single-copy`** | one slice off the GLB body per embedded KTX2: bytes identical ×259 packages; lane 1.9–2.1× (floor 1.39× @16 MB); −55.6 ms per 10 heaviest packages; am-verify `1203c460c` (both `24a2d1557`) |
| 163 | `combat-outcome-quiet-latch` | Quiet flee-scan latch median **~2.05×** (30k) / **~2.38×** (100k warmed), floor **≥1.80×** (5×11 isolated @ N=40); dirty-wake ok (11 wake events + membership + 0.5 s rescan); focused **70/70**; am-verify `8a6d29ada` |

## Scour attempts / misses this pass

| Attempt | Result |
|---|---|
| hull-integrity `updateShipCondition` settled DOM pass | **SHIP #164**: 21.2× / 10.1× per-frame, floor ≥8.6× |
| presentationRunner per-frame `performance.memory` read | **SHIP #165**: ~52 µs/frame removed |
| scene-matrix-retain (`updateMatrixWorld` dirty compare) | **HOLD**: 0.66× with required validation (1.59× unsafe) |
| sg02 prestep kinematic carry | **HOLD**: ~1.2–1.3× ceiling |
| survivorPod / scanner / bulletTime / fieldDepletion | **thin** ≤0.44 µs (latch vein exhausted) |
| gamepad poll gating / tether acquisition preview | **HOLD** (input / receipt behavior risk) |
| combatOutcome 4-tick shipLike flee-scan quiet-latch | **SHIP #163** — ~2.05–2.38× / ≥1.80× floor |
| fresh ungated scour after combatOutcome (masslineThreats / survivorPod / scanner / bulletTime / fieldDepletion) | ≤~0.6 µs abs, mostly already early-out in production — **not packaged** |
| difficultyDirector settled quiet-latch (prior pass) | SHIP #162 — ~2.98× / ≥2.43× floor |
| mining quiet early-out | settled abs ~0.26 µs thin — **not packaged** |
| sectorSim skip _ensureState between model steps | ~1.09× — **below bar** |
| encounterDirector early/1 Hz path | early ~0.4 µs thin — **held** |
| economy quiet residual (5 s cadence) | ~0.1 µs thin — **not packaged** |
| fair-aiPorts / packCombat / stampNear / lifetime / classify / trust-sleep / law / traffic / bandRadio | **not casually retried** (held) |
| syncEntityViews updater / closure-gate / micromotion / LOD / shield-bubble / factionPresence / aiEncounter rediscovery | **not rediscovered** |
| pickup far-idle magnet-skip / objective idle deepen | **held** (below bar / thin abs) |

## Rock audit (unchanged)

Quiet Ceres after #31: **11** live rocks pinned. **No legal cut**.

## Next poles

The per-system registry.step latch vein is **exhausted**. Prefer thick poles:

1. **sg02 physics JS glue / Rapier getter diet** (~0.08 ms/tick of ~0.21):
   batch `translation()` / `rotation()` / `linvel()` / `angvel()` reads per
   body via one raw-set pass or cached scratch vectors, and skip redundant
   setter round-trips in `_stepFixed` and `_captureExpectedKinematics`.
2. **Three render CPU / batching (pole 3)** ~55 ms/s plus scene
   `updateMatrixWorld` ~10.6 ms/s. scene-matrix-retain held at 0.66× once
   made safe. A real win needs owner-side static-subtree
   `matrixAutoUpdate=false` authoring, not a VM traversal replacement.
3. **Early-flight tacticalAI spike** (0–10 s, ~0.95 ms/tick): ai.stack
   `liveFramesFor` → `entityContacts` / `_contactBaseFor`. Look at contact
   base reuse across stack frames within a tick.
4. **Opening shadow-sweep program links** (~1 s once; pole 2 fewer program keys; owner-GPU).
5. Gamepad `getGamepads` poll gating (~13 µs/tick): only with
   `gamepadconnected`-driven arming, which carries input-behavior risk.
6. radar.draw residual (2.8 ms/s) / tether acquisition preview (~72 µs @12.5 Hz).
7. Carry-forward holds from dz: classify flying residual ~1.3×;
   syncEntityViews updater residuals; prepareFrame quiet-VFX floors;
   trust-sleep ~1.24× (remeasure after imports); and the rest of the list
   below.

### Carry-forward (dz next-poles list, unchanged)

1. registry.step after …+#163 — combatOutcome shipped; next ungated abs: survivorPod promotedByPoint/causal tick (~0.44 µs), scanner (~0.44 µs) — only if ≥1.5× with solid floor. fair-aiPorts held; packCombat only if not
   pose-incremental or single-dirty / further HUD NEW only if ≥1.5×. After owner
   imports pose-incremental + stampNear + lifetime, remeasure bare-master
   preStep before retrying trust-sleep. Hunt other ungated systems with abs
   clearing thin band (combatOutcome **shipped #163**; mining left thin;
   sectorSim held ~1.09×; encounterDirector early thin).
2. syncEntityViews residual after #157+#159 — fresh pickup/ordnance/infra
   **updater** residuals only if abs clears thin band (not closure-gate
   rediscovery); applySnapshotPose hold ~0.85×; asteroid settled ~1.14× +
   render-entity-frame retain ~1.21× held; pickup far-idle magnet-skip ~1.35× held.
3. classifyWorld residual after #37+#38+#45+#48+#60+#62+#64+#127+#128+#138+#141
   — flying vs parked residual ~1.3×; NPC/ship visit deepen still thin ~1.08×;
   disc-admission visit-retain thin ~1.12×; **flying-early-latch held ~1.3×**.
4. prepareFrame residual after #13+#44+#46+#47+#51–#126 (quiet-VFX floors
   held; many quiet-live pools packaged awaiting import — do not rediscover).
5. Soft-GPU fps is not a KPI.
6. environmentalMachinery far (held ~0.87×).
7. Deferred/held: hazards far; asteroid-field **empty** ~1.22×; zoneAt;
   lifetimeSweep no-movable / compact-skip / pose-rematch / sleeping-clocks /
   **quiet-compact-skip floorMin 1.30×**;
   **flying-early-latch ~1.3×**; asteroid-motion settled; render-entity-frame
   unchanged retain; projectile-evidence surface-cadence deepen ~1.0×;
   weapons quiet residual deepen ~1.3×; spatial all-sleeping sync (needs awake-set);
   impulseCharges empty; updateDockRange far; tether-web empty VFX;
   lawSecurity quiet residual after cones+sanctuary ~0.5–1.0 µs thin;
   ai/aiPorts isolation-only sketches (classify-inflated);
   **preStep trust-physicsSleeping bare-master ~1.24×**;
   **bandRadio ~2.2 µs thin**; traffic classify-inflated;
   **classify flying residual over parked ~1.3×**;
   **objective idle deepen ~0.37 µs thin**;
   **pickup far-idle magnet-skip ~1.35×**;
   **encounterDirector early ~0.4 µs thin** (1 Hz already);
   **mining settled ~0.26 µs thin**;
   **sectorSim ensureState-skip ~1.09×**.

## Scratch

- #164/#165 scratch branch: `vm-work/hillclimb-20260924u` @ `c87319ee5` (pushed) / `/workspace/spaceface-scratch/master-20260924u`
- Full-stack profiling worktree (local only, not pushed): `vm-work/stack-20260924u` / `/workspace/spaceface-scratch/stack-20260924u`

- Portable scour branch: `vm-work/hillclimb-20260924t`
- Prior portable worktree: `/workspace/spaceface-scratch/hillclimb-20260924p` @ `f3008ec52` (#163; unchanged)
- Prior #162 scratch tip: `4d137d720`; #161: `cc826f487`
- Stacked WIP (trust-sleep only; not packaged): `vm-work/hillclimb-20260924o`
  @ `2911f4458` / `/workspace/spaceface-scratch/hillclimb-20260924h`
- Master tip: `97c88f92b`
