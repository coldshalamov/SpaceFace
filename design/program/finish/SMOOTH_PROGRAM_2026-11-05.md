<!-- LIFETIME: STABLE -->
# The Smooth Program — playable first (owner direction, 2026-11-05)

**Owner direction, 2026-11-05.** "The game is entirely useless as long as it's not running smoothly
and things loading in time to be on the screen. We need to play with dozens of enemy units on screen.
It needs to be 2x–3x faster and smoother." Mild quality loss and ripping out over-complex machinery
are authorized when they buy measured smoothness. This document is the Lane 1/Lane 2 performance
plan until its finish line reads met; it supersedes older "never reduce quality" text for this work.

## 1. Diagnosis — why the 3D world froze while the HUD kept spinning

Measured in headed Chrome on the owner's class of machine (Intel iGPU, ANGLE/D3D11, 1440×900),
Helios Adventure start, flying / boosting / tethering, and Crucible Swarm wave 15.

1. **It was a real freeze, not "low FPS".** The whole simulation runs in a Web Worker
   (`src/core/wholeSimBrowserWorker.js`, `scripts/lib/simWorkerHost.mjs`). One 60 Hz sim step cost
   ~14 ms; only 36–42 steps/s landed in Adventure and ~20 steps/s in a 21-hostile Swarm fight. The
   presentation only moved when a worker reply arrived and never extrapolated, so whenever the
   worker fell behind the 3D world **held still until the next reply** (100–600 ms gaps), then
   jumped. Boost and tether made it worse because they pull more bodies, contacts and visible
   objects into the step (visible drawables 1100 → 2200 while boosting).
2. **The HUD kept moving because it is not the game loop.** The speed-dial spin and similar HUD motion
   are CSS / Web-Animations, which run on the browser compositor even while the main thread or the
   sim is stalled. They are not evidence that the machine was idle.
3. **The main thread was also ~100% busy**: 60–190 ms long tasks almost every frame (10–17 fps).
   Half resolution gained only 15–30 %, so it is CPU-bound, not GPU-bound. Biggest costs: scene
   draw (~1,100 drawables, setProgram/uniform upload), HUD receipt placement (rect reads 10×/s),
   hover picking (brute-force triangle raycast every frame), camera roof queries, presentation
   re-classification of the whole world every frame, residency bookkeeping, VFX, 17 lights.
4. **Slow-motion features did not cause it** (flyby focus 0.5× and swarm hit-stop exist, but none
   fired in the measured runs). No "physics must land first" lock exists; the freeze is the
   no-extrapolation presentation plus a too-slow step.

## 2. Measurement kit (use these, not intuition)

All under `.devshots/smooth-2026-11-05/` (ignored; copy forward if the folder is cleaned):

| Tool | What it answers |
|---|---|
| `hitch-probe.mjs` (`OUT=… PROFILE=1 QS=?simLane=main VIDEO='{"renderScale":0.5}'`) | Adventure cruise/boost/coast/tether/powers: fps, frame p95/max, **sim steps/s**, worker work ms, presented freezes, slow-mo sources, programs/lights/visible drawables per phase, main-thread .cpuprofile |
| `swarm-probe.mjs` (`WAVE=15 MS=40000`) | Real Crucible Swarm route to a 20+ hostile fight with auto-aim/boost/tether; per-5 s fps, sim steps/s, hostiles, freezes |
| `census.mjs` | What the visible drawables are, grouped by entity kind |
| `prof.mjs <cpuprofile> N` / `kids.mjs <cpuprofile> "<fn file:line>" depth` | Top self/inclusive costs; callee breakdown of any function |

Rules: one GPU owner at a time; kill orphaned harness processes before measuring (a stray test
runner pinned a core during one run and made a good build look worse); compare within one session.

## 3. Round 1 — landed (commit `c828480b65d1`)

Twelve parallel packages, disjoint file ownership, focused tests only. Measured after:

| Route | Before | After |
|---|---|---|
| Adventure flight fps | 11–17 | 16–32 |
| Adventure sim steps/s (need 60) | 36–42 | 45–60 |
| Swarm wave 15, 22 hostiles, fps | 11.8 | 18.3 |
| Swarm sim steps/s | 20 | 38 |
| Swarm longest presented freeze | 284 ms | 193 ms |

- **The freeze fix (`snapshotFence.js`).** Presentation is a wall-clock playout clock at the measured
  sim rate, with bounded extrapolation (≤0.1 s, ≤40 WU per body, never rewinds). A late worker now
  reads as steady motion, not hold-and-jump. `interpolationAlpha` publishes the same moment for VFX.
- **Worker catch-up budget**: a reply batch stops after 24 ms of work and sheds the rest (slow-motion
  beats a stalled picture).
- **HUD**: receipt placement at 2 Hz when idle; hover picking repicks ~7 Hz and box-tests dense leaves
  instead of brute-force triangles; radar heat zone strokes only the visible arc.
- **Camera roof**: structural records validated once per glide frame (~75 % cheaper, same answers).
- **Activity classification**: presentation reclassifies every 4 ticks or on membership change; fewer
  allocations and cell-index rebuilds.
- **Lights 17 → 10**: player headlight only (NPC beams removed), 3 nocturne GPU points.
- **VFX**: field geometry 30 Hz, coarser force-flow subdivision, medium particle cap 2000; tether and
  power-preview shader programs join the first-flight warm set (first tether/power press no longer
  links programs mid-flight).
- **Sim cadence**: faction / law / mass-signature / title scans on 2–8 step strides in production.
- **Worker reply apply**: skip roster rebuild when unchanged, single-pass vitals.
- **Slow-host admission**: heavy work is "late" relative to the host's own smoothed cadence; forced
  after 3 skips; on-glass geometry batches of 16 (models stop waiting forever on slow machines).

## 4. Round 2 — landed (commit `53e69d314d03`, measured 2026-11-05)

| Package | Result |
|---|---|
| R2-A Draw-call merge | Packaged hulk leaves merge per material (shared cached merged geometry); fallback drone body 3 meshes → 1. Ship-hull merge still open — the biggest leaf count |
| R2-B HUD/radar | Selector walks + band solves memoized per flush; radar heat ring on an offscreen layer repainted only when it moves; line-strain readout dirty-gated, viewport cached |
| R2-C In-flight loading | Quantized/normalized position bounds take the plain fast path exactly (was the ~0.5 s/30 s slow path on new ship models) |
| R2-D Physics solver | **Landed** — Rapier `numSolverIterations` 12 → 6 in `sg02DynamicBodyOwner.js` (owner approval 2026-11-05). Dense-contact + rope microbench: physics step −25–30 % (0.69–0.76 vs 0.89–1.00 ms/step, 44 bodies/10 ropes). Migration = the designed path: a legacy-iterations snapshot is refused by the native runtime contract and rebuilds scalar — old saves still load, they just take the already-tested slow-adopt once. Golden re-record was deliberate and reviewed: in-tree A/B reproduced both prior hashes exactly under 12, then under 6 only motion leaf fields moved (≤1.5 WU player, ≤0.3 WU others, ≤0.4 WU/s) — identical fires/hits/tether ticks/damage; both gated envelopes updated with the evidence in `notes` |
| R2-E AI/flight at scale | Far-from-player combat members refresh perception/doctrine at half rate; NPC job threat scans read the ship lane of the entity index (map-validated) instead of all entities |
| R2-G Stand-ins + sector prewarm | Pending roots already drawing a resident proxy stay on glass; `_noMesh` rows stop holding the opening gate; every asteroid size class the range can spawn is warmed |

Measured (quiet host): Swarm wave 15 at 23 hostiles — **43.1 sim steps/s** (was 37.9 after
Round 1), longest presented freeze 190 ms; Adventure cruise 18–22 fps / 47–54 steps/s. The
first noisy-machine re-run looked like a regression — it was host contention again; always
re-measure on a quiet machine before judging. One 1.3 s first-run tether stall observed once
(big journal flush of arrivals), not reproduced on the second run.

Left uncommitted in the tree (deliberate): the pre-existing `isStartupPackagedContactEntity`
hunks in `renderer.js`/`partsLibrary.js` — they keep models loaded that tests say should be
let go; they are not part of this program until that disagreement is resolved.

Follow-up (same session): the `_threatCandidates` ship-lane scan now validates each indexed row
against the entity map (`entities.get(id) === entity`) and only latches its cache when a real
index version exists — raw `entities.delete()` removals can no longer strand a stale ship in the
lane. The four resume-work regressions this caused are green again (60/60 focused batch).

Fresh `?simLane=main` profile on the Round-2 build (30 s Adventure flight, quiet host) —
what the remaining cost actually is:

| Cost (self, /30 s) | Where | Verdict |
|---|---|---|
| ~1.2 s | Rapier/SG-02 fixed step | owner decision §6 (solver 12 → 6 + save migration) |
| ~0.9 s | `readReceiptRect` layout reads | receipt flush read-write-read thrash; needs a write-deferral restructure, not a cache tweak |
| ~0.6 s | `physics:impact` listener fan-out | already deduped/gated at each layer (admitPair, quiet latches); coalescing proven a dead end in the prior investigation |
| ~0.5 s | `clearIneligibleAIFiringIntents` sweep | **not stridable**: guns fire directly off `intent.fire` in `weapons.js` — the fail-closed sweep is the authority, not hygiene |
| ~0.3 s | `classifyWorld` activity classification | per-tick, already single-pass; staleness gates physics lanes — risky to stride |
| ~0.57 s | footage `convertToBlob` | already inside the capture worker, not the main thread |

Honest read: the cheap sim-side wins are landed. What remains is the solver decision,
the ship-hull merge (largest draw-call lever), the HUD write-phase restructure, and reply-size
work — all multi-hour, each itemized in §5.

**2026-11-05 residency measurement (wave-15 swarm, `swarm-residency-probe.mjs` — samples each
hostile's `userData.authoredAssetState` through the fight):**

- p50 time-alive-until-authored **12.1 s**, p90 13.5 s, max 18.5 s; 12/32 spawned hostiles never
  reached authored in 45 s (died or still pending as stand-ins).
- Steady state mid-fight: ~5 of 20 hostiles pending — `compiling-pipelines` ~4–6, `loading` ~1–4.
- Stage dwell: `loading → authored` avg 11.4 s; **`compiling-pipelines → authored` avg 7.2 s** —
  the pipeline tail, not the decode, is the dominant late-load.
- Root cause: every in-flight authored admission runs the serial paced lane —
  `yieldBetweenGpuStages = (mode === 'flight')` unconditionally, ~8+ present-yields per entity plus
  queue depth, with no resident-program fast path. Repeat-archetype enemies whose programs are
  already linked pay the same tail as first-of-family.
- Caveat: the probe's `jumpToWave` skips the armory dwells where `_warmSwarmDeferredRoster`
  builds exemplars, so this run measured the cold path. Real wave play is warmer; the cold path
  is still what reinforcements, boss wings, spawn-late traffic and adventure mid-sector spawns hit.
- Census (ordinary flight): 756 visible drawables; `kind:ship` 326 + `kind:drone` 184 +
  `kind:wreck` 103 = **81 %, zero instanced**. `rigidOpaqueBatch` (BatchedMesh) is proven but
  scoped to the player + ashline cohort only.

## 5. The ranked backlog (what else to do, highest ROI first)

Each row is a self-contained agent package: owned files, measured before-cost, target, focused tests.

1. **Sim step under 8 ms at 30 hostiles.** Worker per-system timing RPC (wrap `s.update` in
   `authoritativeSimStep.js`, expose next to `probePerformance`) so every later package measures the
   worker directly; then physics (contact fan-out listeners on `physics:impact`, proxy-id
   dirty flag in `syncFromEntityLayers` — solver-iteration reduction landed in R2-D), AI, flight.
2. **Crowd batching — the single biggest fps lever.** 613 of 756 drawables are
   ship/drone/wreck leaves, zero instanced (census above). Widen `rigidOpaqueBatch` admission
   (`selectSource`/`isTransformOnlySource`/`isRigidOpaqueBatchMotionSafe` in
   `rigidOpaqueBatch.js`/`rigidOpaqueBatchPolicy.js`) beyond the player+ashline pilot to
   repeated authored leaves sharing (geometry, material) — same-defId enemies, drones, wrecks.
   Turret/animated nodes stay direct via the existing motion-safety gate. Target: crowd draw
   calls 613 → <150.
3. **Resident-program fast lane — the biggest load-latency lever.** The 7 s `compiling-pipelines`
   dwell is mostly paced queue, not GPU work: `yieldBetweenGpuStages` paces every flight
   admission unconditionally (`partsLibrary.js` ~7639/8257). Add a program-resident verdict
   (canonical program registry / `programCanon` linked-key check across the boundary's material
   set); when every program is already linked, run the prepare's stages back-to-back without
   present-yields. Repeat-archetype enemies — the entire swarm crowd — go ~7 s → sub-second.
4. **Zero first-use compiles in flight.** CI-style check: `renderer.info.programs` must not grow after
   the first 5 s of flight across boost, tether, each power, docking, weapons, explosions. Every
   offender goes into the precompile salvo / first-flight warm set.
5. **Warm coverage at spawn intent.** `run:wavePlanned` exemplar warm covers the natural dwell;
   extend the same mount+compile warm (not just decode) to wave-jump/restore/reinforcement
   paths (`_reinforceSwarm`, `capitalBoss` wings, adventure mid-sector spawn kicks) so no
   archetype's first compile happens inside the fight.
6. **HUD near zero.** One read phase and one write phase per frame across all HUD owners; signature
   skips; no `getBoundingClientRect` in steady state.
7. **Presentation bookkeeping.** `syncEntityViews` skips unchanged off-glass roots; `matrixAutoUpdate`
   off for static stations/props/background; maintained lists instead of scene traversals.
8. **Adaptive quality that actually adapts.** Auto lowers render scale on iGPU when frames are slow
   (Round 1 halved its reaction time); add a "Smooth" preset that also trims particles and bloom.
9. **Worker reply size.** Ship vitals only for changed fields; event replay coalescing; transform-only
   journal visits.
10. **Load path.** One manifest-driven start set; landmarks/works/wreck places out of the first-sector
   bundle; re-encode the 20 release GLBs over 2 MB (`fin_wedge` release is larger than its source).
11. **Delete over-built machinery** when a package proves it costs more than it gives (candidates:
   duplicated legacy `worker-pump` clock path in `simLaneMain.js`, per-frame guards that re-prove
   settled programs, observer recorders at 60 Hz such as kill replay).

## 6. Decisions that are the owner's (product/feel, not technical)

| Option | Gain | Cost |
|---|---|---|
| Cap the exceptional-speed zoom-out 3.5× → ~2.5× (`tabletopPolicy.js` `PHYSICS_EARNED_SPEED_ZOOM_MAX`, FEEL_CONTRACT §C) | far fewer objects on screen while boosting (drawables doubled at 3.5×) | the "world opens up" at extreme speed is less dramatic |
| ~~Rapier solver iterations 12 → 6~~ | **approved and landed (R2-D)** | — |
| NPC headlight beams (removed in Round 1) | 2 fewer lights in every shader | NPC ships no longer cast beams |

## 7. Finish line

- Adventure ordinary flight with boost/tether: ≥45 fps p50, no presented freeze >100 ms, sim ≥58
  steps/s, no program growth after warm-up.
- Swarm with 30 hostiles: ≥30 fps p50, sim ≥55 steps/s, no presented freeze >150 ms.
- No entity on the glass is ever invisible: proxy or final, never nothing.
- Measured with the kit in §2 on the owner's class of machine, same session, quiet host.
