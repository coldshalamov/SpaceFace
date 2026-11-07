<!-- LIFETIME: ACTIVE_PROGRAM -->
# Q1 — Switched-off and placeholder census

**Scope.** `src/` at `84bfa536fef5` plus the exact assets/config a row needs. Excluded: `design/`,
`test/`, `node_modules`, `vendor/`, generated localization catalogs, and the dirty hunks other agents
hold in `NOW.md` (left untouched). Method: `rg` for flag/placeholder/bar idioms, then each hit read at
its owner to confirm the branch is live; counts measured, not quoted from older plans.

**Decision rule.** *Turn on* needs a measured win and a versioned-reference plan when it moves
determinism or save. *Keep off* needs a measured reason, not caution. "Delete" means the code has no
live writer or no player route.

## Summary

| id | Setting (file:line) | What it gates | Now | Decision | Evidence | Risk | Owner |
|---|---|---|---|---|---|---|---|
| Q1-01 | `simCoreFlags.economySlicing`, `src/core/simCoreFlags.js` | Economy pass spreads a 130–150 ms spike over the fixed tick; per-tick drain + save cursor | **off (held)** | **keep off until clean v26** | Per-fixed-tick drain: `economy` 14.05 → 0.027 ms/call, `economy.drift` 56.41 → 3.82; `.devshots/sim-step-profile/econ-drain-ab.json`; 2100/60 s cadence tests green; v24 active, v25 obsolete | 47-A remains v24 on this dirty tree | E2 |
| Q1-02 | Electron static headers, `electron/main.cjs:496` + `scripts/lib/gameServer.cjs:390-397` | `crossOriginIsolated` → SAB sim lane in Electron | **on (shared server)** | **verify live** | The shared server always sets COOP `same-origin` + COEP `credentialless` and merges Electron's CSP over them; `main.cjs` passes only CSP, so it adds, not replaces. `simLaneMain.js:317-322` auto-arms when isolated. | Transport fallback only; no determinism change | E5 |
| Q1-03 | `COMBAT_FLAGS.momentumInherit`, `src/runtime/runtimeProfiles.js:14,78` | Bullets inherit shooter velocity (weighty, aim-untrue) | **off everywhere** | **keep off** | measured aim regression, `src/systems/weapons.js:2663-2674` | Every TTK/lead table invalid | Q4 + FEEL A8 |
| Q1-04 | `wallClockOfflineProgress`, `src/systems/automation.js:4002` | Offline automation catch-up | **no writer** | **delete** | `rg wallClockOffline` → readers only; `pendingOfflineElapsedSec` also writer-less | Hides a player-facing feature that never was | Q4 |
| Q1-05 | Phase-14 sim worker, `src/core/simWorkerHost.js:62` | Second ballistic-kernel worker lane | **test-only** | **delete** | `__simWorkerPhase14` written nowhere; only `test/*` import the host | None; production uses `wholeSimBrowserWorker.js` | Q4 |
| Q1-06 | `_ashlineFactorPaletteEnabled`, `src/render/renderer.js:9607` | Cold-surface factor ABI for hull batching | **off** | **measure or delete** | `INTEGRATION_COVERAGE.md:123` "pending actual shader/look/frame qualification" | Look/frame unproven | E7 |
| Q1-07 | `video.renderGraph`, `src/core/gameState.js:48` | GTAO + multiscale composite route | **off (Balanced)** | **keep off at Balanced** | High tier opts in (`adaptiveQuality.js:160`); iGPU already GPU p50 23.7 ms (MASTER_PLAN §1.2) | AO adds GPU ms on the target | E7 |
| Q1-08 | `flightStaticV3`/`mergeGroups`, `scripts/build-render-package-pilots.mjs:401` | Offline flight-static instance merge | **9/422 / 0/422** | **tune** | counted: 9 manifest rows true, 0 package JSON has `mergeGroups`, 422 packages | Rebuild churn; appearance must not move | E6/E7 |
| Q1-09 | Integrated preset suggestion, `src/render/renderer.js:11371` | iGPU preset (0.75 scale, pixel 1, 60 cap) | **toast only** | **tune: auto-apply after a measured miss, with receipt** | `PERF_WHAT_MATTERS` forbids silent cuts; 23.7 ms GPU p50 on owner iGPU | Silent quality loss if unannounced | E7 |
| Q1-10 | `autosaveIntervalS: 300`, `src/core/gameState.js:50-55` | Autosave cadence | **300 s** | **keep 300 until capture is sliced** | save capture is one synchronous task, `saveSystem.js:3110` | 60 s multiplies stalls 5× | E2 + save |
| Q1-11 | Tumble constants, `src/core/sg02DynamicBodyOwner.js:192-200` | Loose-hull bounce/spin | 0.6 / 0.05 / 160 | **tune** | "Placeholders; nothing has tuned them"; 28 WU/s→16.8 rebound measured in comment | Pinball if too high | SWARM F (AUDIT P3) |
| Q1-12 | `PROJECTILE_HULL_LAW`, `src/combat/impulseKernel.js:209-214` | Hull-on-hull fling damage | 0.6 / 20 WU/s | **tune** | same "Placeholders" comment; first-tick-only read was measured broken | Over-kill chains | SWARM F |
| Q1-13 | Loot constants, `src/systems/mining.js:160-166` | Kill-loot homing beat + refused-ore scrap | 0.5 s / 8% | **tune** | "Placeholders; untuned"; 8% sized against ~65 cr chip | Economy inflation | SWARM F |
| Q1-14 | `SALVAGE_BAY.saleRate`, `src/systems/cargo.js:614` | Dock scrap rate for the salvage bay | 0.6 | **tune** | "the doc's 60% scrap placeholder" | Combat income > hauling | Q4/economy |
| Q1-15 | Unreachable content, `REPORT_CARD.md:56-63` | Voiced lines, contact counters, court cases, boss counters | built | **wire** | 439 lines, 12 counters, 11 court cases, photo Look | Content debt, not a switch | W4/X4/W2 |
| Q1-16 | Kestrel LOD0-only, `src/render/lod.js:10-13` | LOD1/LOD2 ship geometry | **absent** | **keep (asset gap)** | selector + hysteresis tested; no LOD1/2 geometry | Pop-in at distance | X2/E7 |
| Q1-17 | Legacy `ai.js`, `src/systems/ai.js:553` | Compatibility AI backend | **off every profile** | **keep off; Q4 delete** | comment: "legacy slot is off every live profile" | None on the ordinary route | Q4 |
| Q1-18 | `dynamicResolution: false`, `src/render/adaptiveQuality.js:108-166` | Manual dynamic resolution | **off** | **keep** | Auto still enables it, `adaptiveQuality.js:367-370` | Players on Manual lose auto | E7 |
| Q1-19 | `SWARM_REPAIR_PER_ROUND_MAX = 2`, `src/systems/swarmSupply.js:51` | Repair cells per round | 2 | **keep** | "one or two cells, never a pharmacy" | Swarm attrition | SWARM S (S12) |
| Q1-20 | `LOCAL_MAX_UNACKED = 4`, `src/core/wholeSimBrowserWorker.js:104` | Worker publish window | 4 | **keep** | comment: larger window collapses into multi-second cycles | Freeze | E1 |
| Q1-21 | Catch-up caps, `src/core/simulationRunner.js:8,24` | Steps per frame / hitch | 4 / 2 | **keep** | "not an unbounded spiral" | Sim spiral | E1 |
| Q1-22 | Safety clamps, `sg02DynamicBodyOwner.js:171,183`, `fields.js:100` | Contact dv, pose jump, field accel | 40/128/820 | **keep** | measured flings to −1.27 MWU without them | Bodies teleport | E2/SWARM F |
| Q1-23 | Star marker, `src/render/machineVisuals.js:715` | AE-243 reference needle | "thin, untuned" | **keep** | cosmetic, 0.1×3.8 cone | None | X1 |
| Q1-24 | Profiler/frame-truth/perf counters | Diagnostics | off by default | **keep** | one boolean per step (E2 STATUS row 1) | Measurement only | E10 |
| Q1-25 | `?rigidOpaqueBatch=1` broad probe, `renderer.js:9600-9604` | Whole-scene batch cohort | probe only | **keep off** | default cohort is the bounded Kestrel path | Unbounded merge look risk | E7 |
| Q1-26 | `simCoreFlags.telemetryDemand`, `src/core/simCoreFlags.js:23` (uncommitted) | Per-body physics telemetry publication | **off now** | **keep off until every reader opts in** | comment names rig-workshop new-keel admission and the buoy service as silently broken | Player feature disappears | E2 |

## Top 15 expanded

**Q1-01 - Economy slicing is finished and verified, but the shipped default stays off until a clean
reference.** `src/core/simCoreFlags.js`: the pass is resumable and now advances once per fixed tick
(`partitionUpdateSystems.drainStep`), so a 2 Hz calendar owner cannot outlive its 5 s due period.
The 2100-tick and 60 s cadence tests are green, `serialize()` snapshots the cursor instead of
advancing, and a flag-on 47-A run is deterministic/reload-equal (`fb76e5b9…` legacy, `f06c59d5…` v3).
The shared checkout is red from foreign uncommitted starter-shield and gamepad-latch edits, so the
v26 reference is withheld; v24 `1fedbd09…` stays active and v25 `080c5bd9…` is the obsolete
un-drained shape. Owner E2; see `campaigns/E2/STATUS.md` rows 7 and the determinism section.

**Q1-02 - E5's shared-memory lane is open on the web and armed by the shared Electron server.**
`vercel.json:17-30` now sends `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: credentialless`, so `simLaneMain.js:317-322` auto-arms the SAB journal
in a browser. Electron serves the same route through the shared `createGameServer`
(`electron/main.cjs:1289,1418`), which always sets COOP `same-origin` + COEP `credentialless` and
then merges Electron's `Content-Security-Policy` over them, so the isolation headers are present.
**Decision: verify live** with a `crossOriginIsolated === true` receipt from the packaged shell and
the lane's own trace; do not add a second header path. This is transport only: no sim result, RNG
draw or save byte moves, so no versioned reference is needed. Owner E5, whose NOW.md row already
flags "Electron live probe" as open.

**Q1-03 — Momentum inheritance is the one combat flag off in every profile.**
`runtimeProfiles.js:14` (production) and `:78` (legacy47a) both say false;
`src/systems/weapons.js:1766-1769`: *"A deliberate feel inversion kept behind a default-off flag so
the golden (and normal play) are unchanged; enable it only for playtesting."* The code at `:2663-2674`
records why aim-true exists: the relative-frame variant made *"a strafing player's rounds lead in the
opposite direction and miss moving targets by whole hulls."* **Decision: keep off**, and state the
design reason rather than the golden: FEEL A8 makes guns the finisher and physics the weapon, which
requires the shot to land on the reticle. If ever trialled it needs a new profile (not production), a
versioned reference and a TTK table. Owner Q4 for the flag's disposition; combat owner for the
comment rewrite.

**Q1-04 — Offline automation is a writer-less branch.**
`src/systems/automation.js:3965-3966` says *"Wall-clock is gated: settings.gameplay.wallClockOfflineProgress
=== true (OFF by default in lab/deterministic hosts)"*, but `rg` finds no writer for that key anywhere
in `src/`, no row in `gameState.js`, and no settings control. `opts.wallClockOffline` is never passed;
`pendingOfflineElapsedSec` is only read and cleared. **Decision: delete** the dead gate and its
comment, or promote it to a real feature with a settings row and a save/versioned plan — that is a new
feature, not a Q1 flip. Risk of deleting: none on the ordinary route; tests that assert the gate
(`test/fb-determinism-wall-time-guard.test.mjs:102-108`) become behaviour tests on the surviving path.
Owner Q4.

**Q1-05 — A second simulation lane is alive only in tests.**
`src/core/simWorker.js:1-4`: *"Phase-14 simulation worker entry... The normal game does not opt into
this entry yet; `simWorkerHost.js` requires an explicit phase-14 opt-in plus shared-memory
prerequisites."* `phase14OptedIn` reads `state.__simWorkerPhase14` (`simWorkerHost.js:58-63`), which no
file writes. Only `test/performance-worker-save-ui-audio.test.mjs` and
`test/persistence-architecture-poles.test.mjs` import it. **Decision: delete** `simWorker.js`,
`simWorkerHost.js` and `simWorkerProtocol.js` (or re-label them as lab-only and move them under
`src/testing/`). Zero player risk; Q4's count reduction. Owner Q4.

**Q1-06 — The Ashline factor palette is off for an unmeasured reason.**
`src/render/renderer.js:9607` sets `_ashlineFactorPaletteEnabled = false`.
`INTEGRATION_COVERAGE.md:123` says the candidate *"remains default off pending actual shader/look/frame
qualification."* That is caution, not a measurement, so it cannot stay off under Q1's rule.
**Decision: measure or delete.** Required: a matched A/B (same scene, same host) of frame time and a
gameplay-camera look check on a hull whose `LOD*_MOTION_HULL_CORE_{Armor,Hull,Mechanical}` nodes take
the factor path; if the frame delta is under noise and the picture matches, delete the ABI and its
test. Owner E7.

**Q1-07 — GTAO is built, is on only at High, and is not the default picture.**
Balanced and High performance both list "no render graph" (`adaptiveQuality.js:108,134`); High is
*"the render graph's GTAO + multiscale composite"* (`:142-144`), enabled in `:160`. The graph also
owns the only photo-grade stage (`spaceRenderGraph.js:342-344` starts `_photoFilters` off), which is
why the photo Look control is hidden on the default route (`pause.js:860-864`). **Decision: keep off
at Balanced** — the owner's iGPU already spends GPU p50 23.7 ms in a busy Crucible, and the graph
allocates several targets; the route is reachable through the High quality preset for anyone with
headroom. A future AO-only toggle is an E7 option, not a Q1 flip. Risk of forcing it on: a GPU-bound
default on the machine the game is measured on.

**Q1-08 — "mergeGroups on 1 of 414" is stale; the real number is 0 of 422.**
`build-render-package-pilots.mjs:401-403` derives merge groups only when `pilot.flightStaticV3 === true`;
`src/render/renderPackageManifest.js` marks **9** of **422** rows true, and **no** `render-package.json`
under `assets/ships/release/render-packages` contains `mergeGroups` or `flightStaticV3`. So the
flight-static instance route (root + prepared primitives + markers, `check-render-package-instance-plan.mjs:132-153`)
covers 9 packages and the merge-lane field is never emitted. **Decision: tune** — rebuild the
ship/prop cohort with `flightStaticV3`, confirm object counts fall via the instance-plan check, and
only then judge frame. Risk: rebuild churn and any appearance drift are look-gated. Owner E6/E7.

**Q1-09 — The iGPU preset is a toast, not a setting, on the machine that needs it.**
`renderer.js:11371-11379`: *"Opt-in integrated-GPU preset suggestion. Never auto-applies —
PERF_WHAT_MATTERS forbids silent bloom/shadow cuts. One toast per boot."* The preset itself is built
and reachable in Settings (`settings.js:949-950`), but the player must act on a 12 s toast. **Decision:
tune** — after N seconds of a measured frame-budget miss on an integrated tier, apply the existing
preset with a visible receipt and a one-press revert (the pattern `slowFrameOffer.js` already uses).
Evidence: the 23.7 ms GPU p50 and the existing 0.75-scale tier; no sim/save change, so no reference.
Risk: perceived quality drop; the receipt and revert are the guard. Owner E7.

**Q1-10 — The 5-minute autosave is a self-imposed bar, and shortening it is a trap.**
`gameState.js:50-55`: *"300s default: the worker-lane autosave captures in one synchronous task, which
stalls sim ticks for its full duration on mature saves. Until the capture is sliced, a longer interval
trades a staler recovery point for materially fewer blocking pauses per session — the user-authorized
playability tradeoff."* `saveSystem.js:3110` confirms one synchronous task per write generation.
**Decision: keep 300** until the capture is sliced; then return to 120 with a measured stall table.
Risk of "safer" 60 s: 5× the blocking pauses, which is the freeze the player already reports. Owner E2
(the slicing enabler) + the save owner.

**Q1-11 — Loose-hull bounce is a shipped placeholder.**
`sg02DynamicBodyOwner.js:192-200`: *"Placeholders; nothing has tuned them (design doc §11.6)"* above
`TUMBLE_RESTITUTION = 0.6`, `TUMBLE_MAX_CONTACT_DV = 160`, `TUMBLE_ANGULAR_DAMPING = 0.05`. The same
comment records the measured failure the law exists to fix: a Wasp at 28 WU/s *"rebounds 16.8 WU/s with
no spin and ~0 with 4.3 rad/s."* **Decision: tune** under the Swarm profile (AUDIT P3 band 0.55–0.75),
proving "readable ricochet" over 10 throws plus spin surviving 2 s. This is the demolition-derby core
and the values are self-declared untuned. Risk: pinball randomness; the capture is the gate. Owner
SWARM lane F (AUDIT P3).

**Q1-12 — Hull-on-hull fling law is also a placeholder.**
`impulseKernel.js:203-214`: *"Craft-on-craft consequences used to read only the FIRST solver tick's
momentum exchange (a flung Wasp meeting a second Wasp at 110 WU/s registered ~12 WU/s of knock and ~0.7
damage, so 'flinging enemies into each other' did nothing) ... Placeholders; nothing has tuned them."*
`PROJECTILE_HULL_LAW = { restitution: 0.6, minClosingSpeed: 20 }`. **Decision: tune** with the same
10-throw fixture: a thrown hull must visibly knock a second hull, without deleting the
`minClosingSpeed` brush band. Risk: chain-kill dominance; measure wave length (60–90 s) after. Owner
SWARM lane F.

**Q1-13 — Kill-loot timing and scrap rate are untuned.**
`mining.js:160-166`: *"Hull-burst overhaul slice A ... Placeholders; untuned."* →
`LOOT_HOMING_BEAT_S = 0.5`, `LOOT_OVERFLOW_SCRAP_RATE = 0.08`; the rate comment adds *"Untuned; design
doc section 11.6."* **Decision: tune** against a measured kill→loot→credit trace: the 0.5 s beat must
let the burst read without the pickup feeling late, and 8% must keep a fully refused burst at chip
scale (~100 cr). Risk: combat becomes the dominant income; the check is credits/minute vs hauling.
Owner SWARM lane F + economy.

**Q1-14 — The salvage bay pays a documented placeholder rate.**
`cargo.js:611-615`: `SALVAGE_BAY.saleRate = 0.6`, comment *"share of a commodity's reference price the
dock pays (the doc's 60% scrap placeholder)"*. `salvageBay` is on in production
(`runtimeProfiles.js:25`) and capped at 5× the hold. **Decision: tune** with a measured
fight→dock→credit trace against a hauling run of the same duration; if the bay out-earns hauling,
lower the rate rather than the cap. Risk: the bay's whole point is that fighting pays; changing it
without the comparison just moves the economy. Owner Q4/economy.

**Q1-15 — The report card's "designed things the player never meets" list is still the largest off switch.**
`REPORT_CARD.md:56-63`: *"boss counters that are validated and never displayed; 12 contact counters
with no writer; computed creature anatomy that is never drawn; 11 court cases that only the lab can
reach; 439 voiced lines that are never played; a photo button wired to a graph that is off by
default."* Some have since been wired (the boss overlay mounts counters at
`capitalBossOverlayMount.js:37,442`; the photo button is now hidden rather than dead at
`pause.js:860-864`). **Decision: wire** the remainder rather than re-state them: each item needs its
own route proof, and the photo item is closed by Q1-07's decision. Owner W4 (voice/counters), X4
(audio), W2 (court cases), E7 (photo).

## Late find in the working tree (not mine, preserved)

`src/core/simCoreFlags.js:18-24` (uncommitted, E2 lane) flips `telemetryDemand` from `true` to
`false`: *"several shipped readers (the rig workshop's new-keel admission, the buoy service, the
SG-02/SG-06 checks) still read the receipt without opting in, so demand publication silently removed a
player feature."* That is the census working as intended — a measured optimisation that was quietly
deleting gameplay must stay off until every consumer calls `requestPhysicsTelemetry` first. The row is
Q1-26; the owner is E2, and the prune is a consumer inventory, not a flag flip. This hunk is another
agent's; do not revert it.

## Controller can execute (no lane's source, one line each)

- Correct the stale Q1 examples in `MASTER_PLAN.md:480-481`: BatchedMesh is on by default
  (`renderer.js:9626-9629`); `mergeGroups` is 0/422, not 1/414.
- Delete the historical parenthetical in `src/systems/factions.js:887-888` — the momentum model it
  calls a placeholder is implemented on the next line.
- Rewrite the stale `AUDIT.md` E4 figure (165 WU) to the live `SWARM_SPAWN_DISTANCE = 220`
  (`src/data/swarmMode.js:334`); the gate/flare/1.3-screen law it asked for is already in the file.
- Correct the comment at `src/render/machineVisuals.js:715` if a designer confirms the needle is
  final; the value itself is not a defect.

## Answers

**Which of the 29 campaigns' claimed "landed" features are off by default?**
- **E2** — the headline win, economy slicing, is landed, deterministic, measured and off
  (`simCoreFlags.js:32`); the profiler is off, intentionally, as instrumentation; and the concurrent
  working-tree flip has just turned its demand-driven telemetry back off because it removed a player
  feature (Q1-26).
- **E5** — the web half is on (`vercel.json` headers; SAB auto-arms), and the Electron half is armed
  by the shared server's COOP/COEP defaults; what is missing is a live `crossOriginIsolated` receipt
  and the matched SAB on/off A/B. The transport code is not half-off; the proof is.
- **Q1's own brief** cited BatchedMesh as off and `mergeGroups` as 1/414; both are stale (batch is on
  for supported GPUs; merge groups are 0/422). Treat those two examples as closed.
- Everything else claimed landed is on the player route: E1 playout (`?playout=0` is the kill
  switch), E3 partitioning (`sim.js:129`, `registry.js:810`), E6 residency
  (`renderer.js:25262`), E10 (dev-only by design), P1/P2 ship sheet, SWARM S1/S7/S12/S14 (S7's tell
  floor is inert only for unmarked Adventure hulls, by design).

**Three items that would most improve the player, ranked by evidence.**
1. **Q1-01 economy slicing on.** The only change with a *measured* 40–50× reduction of a recurring
   130–150 ms spike (E2/STATUS:15, `.devshots/sim-step-profile/econ-probe.json`). It attacks the
   freeze/blip the owner reports, and the cost is one generated reference.
2. **Q1-02 Electron isolation proof.** The owner plays on the Electron/iGPU target; the shared
   server already sends COOP/COEP, so the next step is a live `crossOriginIsolated` + SAB receipt and
   a matched on/off A/B, not another header path. The web proof already exists.
3. **Q1-09 integrated preset under a measured miss.** The hardware is known (integrated, GPU p50
   23.7 ms in a busy round) and the lighter tier is already authored and tested; today it is a
   one-shot toast. A receipted auto-apply converts an existing measured deficit into frames without a
   sim or save change.

**Three traps that must stay off (with the measurement).**
1. **Q1-03 momentum inheritance.** `weapons.js:2663-2674` records the measured failure of the
   non-aim-true launch: a strafing player's rounds *"lead in the opposite direction and miss moving
   targets by whole hulls."* Turning it on invalidates every TTK and AI lead table at once.
2. **Sun shadows as a default.** `gameState.js:44-47` + `renderer.js:9680-9682`: at the neighbourhood
   ortho's ~1 WU/texel they *"read as crawling miscolored clumps, not depth"*, and the measured
   opt-in cost was +14.6 ms at the trade hub on the iGPU (adaptiveQuality.js:142-144). Keep the
   toggle; do not move the default.
3. **Shortening autosave to 60 s.** `gameState.js:50-55` and `saveSystem.js:3110`: each write is one
   synchronous capture that stalls sim ticks for its full duration on mature saves. Five times the
   writes is five times the blocking pauses — the opposite of the freeze fix, until the capture is
   sliced. Keep 300 s and spend the effort on slicing.
