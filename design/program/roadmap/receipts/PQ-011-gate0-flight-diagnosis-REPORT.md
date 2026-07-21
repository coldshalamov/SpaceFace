# Flight-Gate Red — Diagnosis & Repair (branch g0/flight-gate-20260721, base master 29ff122a)

Gate: `npm run check:flight:clean` = `flightV3.spec` + `flight-lab-sim` + `probe-flight-visual.mjs --clean-runs 5 --strict-warnings --no-write`.
Owning file repaired: `scripts/probe-flight-visual.mjs` (PROBE-owned; no runtime change).

---

## 1. CAUSE

**Combination (a) intrinsic input-timing race + (b) desktop/mobile concurrency amplifier — surfacing as a non-entity velocity COLLAPSE during the boost measurement. NOT (d) a mobile runtime defect, NOT (c) fixture contamination, and NOT (as I first inferred) an asteroid-entity collision.** The `boostAccelerates`/`reverseBrakes` checks run a continuous turn -> strafe -> throttle -> boost -> reverse maneuver with **no reset** (unlike the tapDash and mode-switch checks, which reset to origin first). Playwright key edges are not synchronized to the sim's executed ticks, so the scripted turn phases (`keyboard.down('ArrowRight')` + `waitForSimTicks(30)`) apply for a **non-deterministic number of executed ticks** — the same script produced `turnRight/turnLeft` counts of 38/31 on one run and 34/35 on another — leaving the post-maneuver heading `rot` anywhere in ~[0.06, 0.93]. The boost phase then accelerates the ship (boost is a >=1x accel multiplier; the assisted speed cap ~200 WU/s is never binding at these speeds) along that random heading, and on some headings the ship passes through a **perturbing region where its velocity collapses mid-ramp** — so `boost.speed` ends up BELOW `throttle.speed`, failing `boostAccelerates` (`boost.speed > throttle.speed + 8`) and dragging `reverseBrakes` (`reverse.speed < boost.speed * 0.78`) down through the shared low `boost.speed` (the exact both-checks-fail-together signature in the recorded red).

**Decisive measurements:** (1) Per-executed-tick logging of a failing desktop run shows a *perfect* boost ramp (speed 30 -> 81 WU/s across ticks 382-410) then an abrupt velocity **collapse** at ticks 411-412 (`81.40 -> 44.30 -> 15.59`, x-velocity reversing sign `+70.6 -> -1.77 -> -4.87`) — the concurrent mobile run ramped cleanly 30 -> 98 because its heading (`rot=-0.06`) differed from desktop's (`rot=0.43`). (2) A dedicated collision-locator (per-tick nearest-collidable scan) proved the collapse is **NOT an entity hit**: at every boost-phase collapse the nearest alive+collidable entity was ~486–491 WU away while the ship was only ~40 WU from origin — i.e. a **non-entity physics perturbation**. It is also **not radially symmetric**: post-reset the ship boosts cleanly from origin out to ~126 WU, *past* the ~40–65 WU band where the un-reset collapses occurred, which rules out a boundary or a global speed cap and localises the perturbation to the pre-reset scene state (which relocation-to-origin sidesteps). The exact source (e.g. a residual collider left by scene isolation) was not isolated further — the reset avoids it deterministically and the pin is mechanism-agnostic, so it does not depend on the answer. (3) The mobile-solo x5 matrix proves the timing race is **intrinsic** (rot still varied 0.06 -> 0.25 with zero viewport concurrency); the concurrent arm proves **(b) amplifies** it (rot spread widened to 0.19 -> 0.93, and that arm produced the outright failure). (4) `waitForSimTicks` never threw or silently swallowed a tick shortfall in any run — every sample was taken at the correct tick count (throttle -> boost delta 41–44 ticks >= 39) — which **falsifies the lead's pre-analysis point (a)/(2) "early sampling via swallowed tick-wait timeout"**: the non-determinism lived in input application (heading), never in tick counting. The recorded red happened to hit mobile; my repros hit desktop — confirming the fault is **viewport-agnostic**.

---

## 2. EVIDENCE MATRIX

Invariant across EVERY run (before and after): Rapier/SG-02 ready, canvas non-blank, zero page errors, zero console errors/warnings; `boosting=true` and `moveZ=1` (throttle held) at every boost sample (boost input always registered — the failure is a velocity collapse, not lost input). **No tick-shortfall / `waitForSimTicks` timeout-swallow events in any run.** The collapse signature is uniform: in **every** failure `boost.speed < throttle.speed`; in **every** pass (including legitimate partial clips) `boost.speed > throttle.speed`.

### BEFORE (un-repaired probe, instrumented)

| Arm | Run | Viewport | Verdict | rot | throttle -> boost speed | collapse (maxDrop) | nearest collidable entity @collapse |
|-----|-----|----------|---------|-----|----------------------|--------------------|-------------------------------------|
| concurrent pair (repro1) | 1 | desktop | **FAIL boostAccelerates** | 0.371 | 35.24 -> **31.89** | (endpoint) | — |
| concurrent pair (repro1) | 1 | mobile | pass | -0.247 | 32.23 -> 101.06 | — | — |
| concurrent pair (per-tick) | 1 | desktop | **FAIL boostAccelerates** | 0.433 | 32.15 -> **17.20** | **0.73 @tick411** | — |
| concurrent pair (per-tick) | 1 | mobile | pass | -0.062 | 31.99 -> 98.49 | 0.01 (clean) | — |
| collision-locator | m1/d3/m2 (boosting) | both | collapse observed | var | — | 0.63/0.53/0.22 | **asteroid ~486–491 WU away** (NOT a hit) |
| mobile-solo x5 | 1-5 | mobile | 5/5 pass | 0.06–0.25 | ~32 -> 50–100 | run5 0.38 (clip, cleared 50.6) | — |
| desktop-solo x3 | 1-3 | desktop | 3/3 pass | 0.06–0.19 | ~32 -> 79–99 | run1 0.22 (near-miss 78.6) | — |
| concurrent x5 | d1 | desktop | **FAIL boostAccelerates + reverseBrakes** | 0.433 | 31.99 -> **12.34** | **0.73 @tick423** | — |
| concurrent x5 | m2 | mobile | pass | 0.185 | 32.85 -> 48.53 | 0.39 (clip, cleared) | — |
| concurrent x5 | remaining 8 | both | pass | 0.06–0.93 | ~32 -> 99–107 | ~0 (clean) | — |

BEFORE failure rate (shipped concurrent shape): outright failures on 3 separate concurrent pairs + several near-miss clips; rot spread across all BEFORE runs **0.062 -> 0.928**. Recorded red reproduced exactly, including the both-checks-fail-together signature (concurrent d1).

### AFTER (repaired probe: reset + collapse-detector pin)

| Arm | Viewport | Verdict | rot | throttle | boost | reverse | Pin |
|-----|----------|---------|-----|----------|-------|---------|-----|
| validation pair | desktop | **pass (all flight checks)** | **0.000** | 32.0 | 99.1 | 45.9 | not tripped |
| validation pair | mobile | **pass (all flight checks)** | **0.000** | 31.2 | 98.3 | 36.7 | not tripped |

After reset: `rot=0` on both viewports (heading pinned along +x), `forwardSpeed == speed` (no off-axis residual), boost margin over the `+8` threshold ~58 WU/s (was negative). `throttleMovesShip` (fwd 32 > 18; 32 > strafe ~8.5) confirmed still passing from the vel=0 cold start.

---

## 3. THE REPAIR

**File: `scripts/probe-flight-visual.mjs` (only).** In `runViewportProbe`, immediately after the strafe phase and before the throttle key-down:

    await resetPlayerForProbe(page, { mode: 'assisted', rot: 0, vel: { x: 0, z: 0 }, boostEnergy: 100 });

`resetPlayerForProbe` is the exact idiom the tapDash and runtime-mode-switch checks already use. It pins `rot=0` (deterministic heading along +x), zeroes velocity (clean throttle baseline, no off-axis residual), and relocates the whole measurement to origin — clean space where the perturbation does not occur. This removes **both** the accumulated-heading non-determinism and the velocity collapse that reds the checks.

**Why gate strength is preserved:** every threshold and tick count is byte-identical — `boost.speed > throttle.speed + 8`, `reverse.speed < boost.speed * 0.78`, tick counts 39/39/54 (and 30/6/42/30/42/21/9 upstream), `--strict-warnings`, `--clean-runs 5`. The reset removes a *confound*; it does not relax a bar. Boost must still out-accelerate throttle by +8 from a clean baseline (now with ~58 WU/s margin), and a genuinely weak boost would still red `boostAccelerates`.

---

## 4. REGRESSION PIN

New helper `assertBoostSampleNotPerturbed(throttle, boost)`, called immediately after the boost sample. Under clean physics the boost sample (taken 39 ticks AFTER the throttle sample, throttle held throughout, boost adding a >=1x accel multiplier, cap never binding) can never be slower than the throttle sample — so `boost.speed < throttle.speed` is only reachable via a mid-ramp **velocity collapse** (collision / stale collider / solver discontinuity). When that holds it throws a retriable `MEASUREMENT_INVALID: boost sample perturbed — boost.speed X < throttle.speed Y ...`; `MEASUREMENT_INVALID` is in `isRetriableProbeError`, so the existing attempt-retry path fires and each retry opens a fresh page (fresh seed), self-healing a transient perturbation while a persistent one reds **loudly** instead of masquerading as a silent boost failure.

**Why this pin and not the corridor-clearance one I first wrote:** my initial pin asserted no collidable *entity* sat near the reset origin. The collision-locator then proved the perturbation is **non-entity** (nearest entity ~490 WU away at every collapse), so an entity-clearance guard would have watched the wrong thing and given false confidence. The collapse-detector triggers on the perturbation's *signature* (`boost.speed < throttle.speed`), which every observed failure exhibited and no pass did — mechanism-agnostic, so it catches this defect class whatever the physical source. It is explicitly NOT a kinematic gate: a weak-but-real boost (`throttle.speed <= boost.speed < throttle.speed + 8`) still reds `boostAccelerates` correctly; only an outright collapse below the throttle baseline is treated as invalid.

**Pin verified live (forced trip):** with the condition forced always-true (`boost.speed < throttle.speed + 1000`), the full runtime chain was observed end-to-end — probe exit 1, each viewport made exactly 3 attempts, and the final issue surfaced `MEASUREMENT_INVALID: boost sample perturbed — boost.speed 98.28 < throttle.speed 31.20 WU/s (a mid-ramp velocity collapse ...)` — confirming it throws, is treated as retriable, retries the capped number of attempts, and ends the run RED with the `MEASUREMENT_INVALID` text surfaced (never a silent pass or unhandled crash). Re-seeding across retries was confirmed separately: an earlier forced-trip variant saw the three sequential retries report three different scene layouts, so a transient perturbation self-heals on a fresh page while a persistent one reds loudly.

---

## 5. THREE CONSECUTIVE FULL-GATE RESULTS

Command per run (the exact `check:flight:clean` chain): `node test/flightV3.spec.mjs && node scripts/flight-lab-sim.mjs && node scripts/probe-flight-visual.mjs --clean-runs 5 --strict-warnings --no-write`, instrumentation and all temp copies removed.

| Gate run | spec exit | flight-lab-sim exit | probe exit | probe verdict | pin false-trips |
|----------|-----------|---------------------|------------|---------------|-----------------|
| 1 | 0 | 0 | 0 | ok=true — 10/10 viewport-runs (5 desktop + 5 mobile) all checks pass | 0 |
| 2 | 0 | 0 | 0 | ok=true — 10/10 viewport-runs all checks pass | 0 |
| 3 | 0 | 0 | 0 | ok=true — 10/10 viewport-runs all checks pass | 0 |

**60/60 viewport-runs green (30 mobile + 30 desktop), 0 MEASUREMENT_INVALID trips, 0 retries needed** — the collapse-detector pin holds without ever disturbing a clean run (boost.speed ~98 is never below throttle.speed ~32). Contrast the BEFORE concurrent rate (3 outright failures + several near-miss clips). (An earlier 3-run pass with the first, entity-clearance, pin was also fully green; this table is the re-run after the pin was corrected to the collapse detector.)

Also run once: `check:sim:compare` (`node scripts/sf-sim.mjs compare 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json --expect test/47a.telemetry.expected.json --reload-at 600`) => **exit 0, top-level `"ok": true`**. The change is probe-only (`git diff --name-only` = `scripts/probe-flight-visual.mjs` alone) and touches no sim/runtime file, so no sim contamination is possible.

**Machine-condition notes:** all acceptance runs executed on this machine, which owns the browser/GPU for this lane; my own diagnostic background jobs were quiesced before each acceptance run, and the gate runs ran strictly sequentially. Per the lead's briefing a sibling code-review lane may run node tests occasionally; I could not directly observe it, so any incidental CPU load was present but uncontrolled — the gate passed regardless, which if anything strengthens the robustness claim.

---

## 6. RESIDUAL RISK (honest)

- **Exact perturbation source not isolated.** I proved the collapse is a non-entity perturbation (nearest collidable entity ~490 WU away) that is not radially symmetric (clean post-reset boost to ~126 WU past the ~40–65 WU collapse band rules out a boundary/speed-cap) and is therefore tied to the pre-reset scene state — but I did not positively identify the exact artifact (a residual collider from `isolateFlightProbeScene` is one candidate; a solver discontinuity another). The repair does not depend on it (it relocates and pins the measurement to origin+rot=0, proven clean by 60/60 green), and the pin is mechanism-agnostic (it triggers on the collapse *signature*, not on any assumed source), so a recurrence — however caused — reds loudly as MEASUREMENT_INVALID rather than as a silent boost red.
- **The pin can mislabel a severe *deterministic* boost regression.** If a future change breaks boost so badly that `boost.speed < throttle.speed` on every attempt, the gate reds as MEASUREMENT_INVALID (all 3 retries trip) rather than as `boostAccelerates`. It still fails safe — never a false pass — and the error prints both speeds, so a reader sees boost is low; but the label points at "measurement" rather than "boost". A weak-but-positive regression (`throttle.speed <= boost.speed < throttle.speed + 8`) is unaffected and still reds `boostAccelerates` correctly.
- **The intrinsic input-timing race still exists** for the upstream turn/strafe checks — but those measure bank/angVel/rot *deltas* tolerant of a few ticks of jitter and have never flaked; only the boost measurement (which integrates heading over a long high-speed path) was fragile, and it is now reset-isolated. The durable deeper fix, if ever needed, is to synchronize key edges to executed ticks (waitForFunction on `state.input` before counting) — out of scope and unnecessary for this gate.
- **Extreme external load:** under pathological CPU starvation a `waitForSimTicks` could still time out; that path already rethrows a retriable "Timeout ... exceeded" and retries, and post-reset can no longer produce a wrong-heading boost sample.

---

## 7. PERTURBATION IDENTIFICATION (coordinator follow-up)

**Verdict: the perturbing object is a STRANDED STATIC physics collider belonging to a moving travel-lane `freighter` NPC. This is a latent RUNTIME physics-classification quirk, EXPOSED and amplified by the probe's frozen isolated scene — it is NOT caused by `isolateFlightProbeScene`'s bypass (freighters are not in that function's type list).** Recommend a runtime ticket; it does not change the accepted gate repair.

**Direct evidence** — instrumented un-reset repro (temp copy, now deleted), physics dump captured AT a boosting-phase collapse tick (mobile, tick 427, backend `rapier-dynamic`):
- Ship at (30.7, 21.7), speed 77.9 → 41.0, velocity (73.2, 26.8) → (40.5, 6.7).
- `nearbyEntities(<160 WU) = []` — no live collidable entity near the collapse (matches the earlier ~490 WU finding).
- `nearbyBodies` held exactly two bodies: the player's own (entId 1, dynamic, body == entity pos, confirming NO frame-origin offset), and **entId 309 type `freighter`, `dynamic:false` (STATIC), radius 12, body at (52.4, 34.9) — but its entity `alive:true` at (2487, 1658)**. Ship↔body centre distance 25.4 WU vs contact radius 14 (ship) + 12 (body) = 26 WU → overlapping → the collision that collapsed the boost. The ship's own body tracked its entity exactly while the freighter's did not, so this is a genuinely stranded collider, not a frame artifact.

**Mechanism (three code sites):**
1. `src/systems/travelLanes.js:460` spawns lane-decoration traffic as `type:'freighter'` (radius 12, **mass 1e5**, `data.parentType:'lane_traffic'`) and **repositions it every update by writing `entity.pos` directly** (lines 448-450, "Entities are never destroyed, so density is constant").
2. `src/core/physicsAuthority.js:272` `defaultDynamic()` marks only ship/drone/payload/projectile (+chunks/debris) dynamic — **`'freighter'` is not listed, so these entities get a STATIC body**.
3. `src/core/sg02DynamicBodyOwner.js:199,204,223` re-syncs/relocates static-body records **only when `staticVersion` changes** (`staticChanged`); a direct `entity.pos` write does not bump the version, so the static collider **stays at its spawn point while the entity slides along the lane** — leaving a high-mass invisible obstacle.

**Probe-hygiene vs runtime P1 — honest discrimination:**
- It is a **runtime** quirk in origin: the misclassification and the stranded-static-body mechanic live entirely in game code (travelLanes + physicsAuthority + sg02 owner), reachable under the shipping default backend (`physicsBackend:'rapier-dynamic'`). A mobile entity with a non-following solid collider is a real latent hazard.
- It is **probe-EXPOSED/amplified**, not probe-caused: the probe's `isolateFlightProbeScene` freezes the scene (kills dynamic NPCs, never bumps `staticVersion`), which removes the normal churn (spawns/despawns/combat) that in live play periodically re-syncs static bodies to their entities' current positions. With that churn gone, the lane freighter's collider strands ~3000 WU behind as the entity keeps sliding, becoming a persistent boost-path obstacle. In live gameplay the same stranding occurs but is likely BOUNDED by how often `staticVersion` bumps — a severity I did NOT measure here (a non-isolated repro was out of the 30-min budget). So: definite latent runtime bug; shipping impact plausible but unquantified.
- The freighter is untouched by the probe's isolation bypass, so the coordinator's "bypass → stale collider is probe-caused" branch does **not** apply; the stranding is a property of `type:'freighter'` + direct-pos-repositioning, independent of the probe.

**Recommended runtime fix (separate ticket, not this gate):** add `'freighter'` to `defaultDynamic()` (or make lane traffic kinematic so the collider follows), OR give decorative lane traffic no solid collider, OR re-sync static bodies when an entity is repositioned. Any of these removes the stranded-collider hazard for real players flying near travel lanes.

**Impact on this gate:** none. The accepted repair (reset to origin + rot=0) relocates the measurement to clean space and sidesteps the stranded collider deterministically (60/60 green); the collapse-detector pin (§4) catches any recurrence — including a future variant of this same runtime bug — as MEASUREMENT_INVALID rather than a silent boost red.

FLIGHT_GATE_DONE
