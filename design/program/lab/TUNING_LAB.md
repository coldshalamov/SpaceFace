# SpaceFace Tuning Lab — Phase 1 notebook

Branch `lab/tuning-phase1`, cut from `origin/master` 7ee4205d8 (2026-10-06). Headless, deterministic,
steps the REAL authoritative runtime (Rapier SG-02 dynamic authority, flight v3, SG-06 tactical AI,
real weapons and auto-target assist, real input keys). This is a feel/correctness lab, not perf.
Every number below came from `scripts/lab/run.mjs` and is reproducible from the listed seeds.
Result summaries (with per-run digests) live in `design/program/lab/results/`.

## 1. Harness (plug-in)

```
node scripts/lab/run.mjs <bench> [--scenarios a,b] [--seeds 1,2,3] [--variant v1,v2]
                                 [--bundle focused|full] [--out file.json] [--quiet]
node scripts/lab/run.mjs tether --seeds 1,2,3 --variant baseline,v3-capDash
node scripts/lab/run.mjs aim    --seeds 1,2,3 --variant baseline,muzzle-only
```

| file | role |
|---|---|
| `scripts/lab/labWorld.mjs` | ONE shared sim stepper. `createLabWorld({seed,bundle,settings})` builds the production manifest (`focused` = production update order filtered to the ~22 systems flight/combat/tether need, ~1 ms/tick; `full` = whole node-safe manifest). Helpers: `spawnPlayer`, `spawnEnemy` (makeEnemySpawnSpec, encounter context), `spawnRock` (payload), `spawnAsteroid` (static occluder), `prepare()` (Rapier backend), `keys(codes,{fire})` (real InputSystem keys + mouse), `aim` (cursor world point via raycastToPlane), `step()`, `digest()`, `playerFlightProfile()`. Feature-flag maps are applied around spawn/prepare like the crucible bench. |
| `scripts/lab/labMetrics.mjs` | `stats` (n/mean/p50/p95/min/max), `table`, `writeResult` (schema `spaceface.tuningLab.result.v1`). |
| `scripts/lab/run.mjs` | CLI. A bench is a module exporting `SCENARIOS`, `DEFAULT_SCENARIOS`, `VARIANTS`, `runScenario(id,{seed,bundle,params})`, `summarizeRuns`, `COLUMNS`; register it in the `BENCHES` map. |
| `scripts/lab/benches/tetherSpin.mjs` | tether spin bench (§3). |
| `scripts/lab/benches/autoAim.mjs` | auto-aim bench (§4). |

Determinism: each run reports a sha256 digest of its kinematic trace. Same seed → same digest
(26/26 baseline runs identical before/after the lab seams were added); different seeds differ.

Lab seams (defaults are byte-identical to master; only the lab flips them):
- `src/core/flight/orbitAssist.js`: `ORBIT_ASSIST_LAB` + `setOrbitAssistLab()` (margin, alignTimeS, comFrame, forwardCommit, thrustGate, lineLockYaw, tangentDash, dashSpeedCap).
- `src/systems/flightV3.js`: honours `maxYawRateOverride` telemetry (line lends yaw) and the tangent-dash prototype in `_triggerDash`.
- `src/systems/weapons.js`: `WEAPONS_AIM_LAB` + `setWeaponsAimLab()` (law `accel`, `muzzle`, `noSpread`), `solveAccelLeadAngle`.
- `src/core/physicsAuthority.js`: read-only `peekPhysicsControl()` (oracle reads the AI's applied force).

Node 20.19 runs it (repo asks >=22.12; nothing needed it). Needs `npm ci --omit=dev`.

## 2. Mechanism map (tether + aim)

**Tether spin.** Space latches the massline (`tetherGameplay`, massline* systems). With W + A/D held
and a live line, `src/core/flight/orbitAssist.js` takes over heading: desired yaw =
orbital yaw rate `cross(r, v_rel)/r²` + heading error / `tangentAlignTimeS` (0.55 s), clamped to
the hull `maxYawRate`; direction = `sign(turnIntent)`; the swing governor
(`ORBIT_SWING_TRACK_MARGIN` 0.9) scales throttle so swing speed ≤ 0.9·maxYaw·r. Active only with
forward intent > 0.05 and lateral ≠ 0. The kernel (`src/core/flight/propulsionKernel.js`) caps WORLD
planar speed at combatSpeed·throttle (×boostSpeedMult 1.55 boosting), never brakes earned speed, and
turns W into counter-thrust when local forward velocity is negative. A boost press fires a dash
impulse along the nose (`flightV3._triggerDash`; swing-drive tangent redirect only with
`mod_swing_drive_m`). Kestrel: maxYawRate 2.646, yawAccel 19.59, combatSpeed 195, boost ×1.55,
mainAccel 168.2, mass 35.

Theoretical best ω (fixed pivot, thrust-sustained): `ω* = min(maxYaw, vcap / r_ship)`,
`r_ship = r·M/(m+M)`. Yaw-limited below r ≈ 195/2.646 ≈ 74 wu, speed-limited above. Soft bound when the
anchor drifts (efficiency up to 1.07–1.12 seen on long lines).

**Auto-aim.** `tickAutoTarget` (combat/autoTargetMode) writes `input.autoAim` only when
`resolvePlayerGunTarget` finds a locked hostile ship/drone (`state.player.targetId`). Weapons then
fire at `_leadAngle` (linear lead solved from the HULL CENTRE, weapons.js:1953) in the pilot/assist
path; G mode (`input.autoFire`) uses `_arcadeMountAngle`, which solves from the real MUZZLE
(weapons.js:1964–1968) and has no spread. Pilot scheme adds weapon spread (pulse 0.6°, autocannon
2.2°). Rounds are aim-true: world direction = aim, speed = projSpeed. No homing on these weapons.
Spinal mounts (railgun) fire along the nose only. Forced heat vent: pegging heatMax locks guns for
`WEAPON_VENT_S`. Enemy AI intent is fully readable (oracle): `data.intent`, `data.ai.activity`
(attack_run / reposition…), reflex state (`src/ai/reflexes.js`: volley_jink, hit_weave…) and the
physics control force (`peekPhysicsControl`).

## 3. Tether spin — baseline (seeds 1,2,3; Kestrel, r ≈ 73 unless noted)

ω* = theoretical best above (2.646 = yaw-limited). eff = ω/ω*. nose° = |nose − ideal tangent|.

| scenario | ω p50 | ω* | eff | T rev s | nose° p50 / p95 | >90° % | wrongTurn % | notes |
|---|---|---|---|---|---|---|---|---|
| spin-plain | 2.66 | 2.646 | 1.01 | 2.37 | 29.4 / 31.9 | 0 | 0 | rate is at the bound; nose lags 29° |
| spin-plain-left | 2.67 | 2.646 | 1.01 | 2.38 | 33.2 / 37.5 | 0 | 0 | mirror |
| spin-boost-hold | 2.70 (boost 2.90) | 2.646 | 1.02 | 2.40 | 48.7 / 147.6 | 12.1 | 0 | orbit collapses to ω≈0.5 mid-boost (trace) |
| spin-boost-taps | 3.52 (boost 4.39) | 2.646 | 1.33 | 1.55 | 75.4 / 169.7 | 43.3 | 4.2 | faster, but nose points backwards 43% |
| spin-short-line (36) | 2.67 | 2.646 | 1.01 | 2.37 | 32.5 / 35.4 | 0 | 0 | |
| spin-long-line (146) | 1.56 | 1.45 | 1.07 | 4.03 | 0.3 / 0.3 | 0 | 0 | speed-limited regime: fine |
| spin-heavy-anchor | 2.39 | 2.646 | 0.90 | 2.63 | 0.5 / 0.5 | 0 | 0 | 0.9 margin by design |
| spin-light-anchor (60) | 2.60 | 2.646 | 0.98 | 2.42 | 86.6 / 121.1 | 45.7 | 0 | worst nose |
| latch-moving-with | 2.74 | 2.646 | 1.03 | 2.31 | 65.6 / 73.5 | 0 | 0 | |
| latch-moving-against | 2.66 | 2.646 | 1.01 | 2.38 | 30.9 / 33.8 | 0 | 0 | |
| release-regrab | 1.47 (r 161) | 1.32 | 1.12 | 4.26 | 0.6 / 26.9 | 0.7 | 0 | coast carries ship out; re-latch at ~160 wu |
| helm-cursor-spin | 0.74 | 2.646 | 0.28 | — | 81.2 / 153.6 | 45.4 | 0 | 5 orbit-direction flips (pendulum) |
| spin-then-coast | 2.71 | 2.646 | 1.02 | 2.32 | 18.3 / 25.3 | 0 | 0 | no drag, holds ω with no thrust |

Verdict: plain spin already revolves at the yaw-limited bound (eff ≈ 1.0), but the NOSE is wrong
in every common flow except the heavy anchor and long line.

### Root causes (traced)
1. **Swing governor uses the wrong frame.** It compares the ship's relative swing to a world-speed
   cap. On a movable anchor the ship only carries `armShare = M/(m+M)` of the swing (0.92 for
   mass 400, 0.63 for 60), so the 0.9 margin is eaten: the assist saturates (sat 100%) and the nose
   lags 29° (87° on a light rock).
2. **Boost dash fires along the lagging nose** (+~150 wu/s). ω jumps above maxYaw, yaw can't
   follow, the lag grows.
3. **Shortest-path heading capture wraps at 180°**: past 180° of lag the nose turns the wrong way
   (trace: angVel −1.03 at ~170° error) → the wrongTurn% in boost-taps.
4. **Past 90° of lag, W becomes counter-thrust** and brakes the orbit → the boost-hold collapse.
5. **Helm/twinstick**: the cursor/stick error sign picks the orbit direction and flips it every
   half revolution (pendulum, ω 0.74).

### Prototypes (lab flags, same seeds)
| variant | what | spin-plain ω / nose p50 | boost-hold ω / nose p95 | boost-taps ω / nose p95 | light anchor ω / nose p50 | short line ω / nose p50 |
|---|---|---|---|---|---|---|
| baseline | — | 2.66 / 29.4° | 2.70 / 147.6° | 3.52 / 169.7° | 2.60 / 86.6° | 2.67 / 32.5° |
| comFrame | governor in the anchor's CoM frame (×armShare) | 2.54 / 0.56° | 2.59 / 148° | 4.35 / 168° | 2.56 / 37.0° | 2.54 / 0.56° |
| v2-capDash | comFrame + heading commit (no 180° wrap) + thrust gate cos(err) + dash redirected to tangent, capped to trackable | 2.54 / 0.56° | 2.54 / 0.56° | 2.55 / 0.56° | 2.58 / 37.5° | 2.54 / 0.56° |
| v2-m95-capDash | v2 with margin 0.95 | 2.64 / 16.5° | 2.63 / 18.1° | 2.65 / 20.1° | 2.65 / 51.1° | 2.65 / 16.4° |
| **v3-capDash** | v2 + the taut line lends yaw (maxYaw ≥ 1.1·orbital rate) + dash capped at the boost speed cap | **3.11 / 0.70°** | **4.69 / 1.6°** | **4.34 / 1.4°** | **5.03 / 1.24°** | 5.95 / 12.6° (p95 21.6°) |

- `commit` alone is worse (wrongTurn 6.8%, reversal 7.4%); it needs the thrust gate.
- v3 makes plain spin 17% faster (T 2.37 → 2.03 s) and boost spin 1.74× (T 1.33 s) with the nose
  within ~1.6° p95 everywhere except the 36-wu short line (yawAccel scaling insufficient: 12.6°).
- Heavy anchor under v3: ω 2.69, nose 0.59°. Long line unchanged (already speed-limited, 0.33°).
- Helm-cursor pendulum is NOT fixed by any variant (direction still comes from the cursor sign).
- **Exploit found:** uncapped tangent dash (v2/v3 without `capDash`) lets dash-spam pump ω to
  ≈ 8.6–9 rad/s. Any tangent-dash change must ship with a cap.

## 4. Auto-aim — baseline (seeds 1,2,3; Kestrel, pilot scheme, invulnerable targets)

The bench locks the target (`state.player.targetId`), parks the cursor on it, fires when in range, and
flies a target-relative pilot script with the real keys (hold, cruise orbit, boosted joust passes,
weave, strafe Q/E, spin). Every player round is tracked from the `combat:fire` tick (keyed by its
data object; projectile ids are recycled) to death. Miss reasons: occluded (hit something else),
PD-intercept (`pds:intercept`), target-contact (velocity jump >800 wu/s² in flight), target-maneuver
(a constant-velocity target would have been hit), lead-error, out-of-range, graze.
`angErr` = atan(cvMiss/range), where cvMiss is the closest approach vs a target that holds its
fire-tick velocity. `dodgeable%` = rounds where the target's authored accel could move it more than
its hull radius during the flight time (½·a·tof²).

| scenario | rounds | hit% | misses (reason) | angErr° p50 | cvMiss p95 wu | dodgeable% | muzzle-solve: hit% / angErr° / cvMiss p95 |
|---|---|---|---|---|---|---|---|
| wasp-hold-160 | 160 | 100.0 | — | 3.20 | 10.9 | 4 | 100.0 / 0.21 / 1.0 |
| wasp-cruise-160 | 35 | 100.0 | — | 3.36 | 13.0 | 72 | 100.0 / 0.22 / 1.5 |
| wasp-boost-160 (boosted joust) | 78 | 100.0 | — | 5.68 | 55.5* | 8 | 100.0 / 0.31 / 39.3* |
| wasp-spin-160 | 155 | 100.0 | — | 3.31 | 10.8 | 20 | 100.0 / 0.19 / 1.0 |
| wasp-strafe-160 | 169 | 100.0 | — | 0.32 | 1.5 | 11 | 100.0 / 0.19 / 0.9 |
| wasp-boostweave-160 | 42 | 100.0 | — | 2.65 | 9.1 | 18 | 100.0 / 0.22 / 1.6 |
| wasp-hold-230 | 165 | 100.0 | — | 3.64 | 10.8 | 17 | 100.0 / 0.19 / 1.1 |
| wasp-pack3-hold | 145 | 91.7 | occluded 8.3% | 3.35 | 10.7 | 19 | 94.6 / 0.19 / 1.0 |
| bruiser-cruise-160 | 91 | 100.0 | — | 3.43 | 11.8 | 59 | 100.0 / 0.16 / 1.5 |
| reaver-strafe-160 | 170 | 100.0 | — | 0.23 | 1.5 | 2 | 100.0 / 0.19 / 1.1 |
| corsair-boostweave-160 | 52 | 100.0 | — | 2.89 | 14.3 | 30 | 100.0 / 0.29 / 5.6 |
| mule-flee-boost | 135 | 88.9 | PD-intercept 11.1% | 0.50 | 10.0 | 24 | 91.1 / 0.21 / 1.0 |
| wasp-cruise-autocannon | 10 | 100.0 | — | 3.68 | 18.4 | 69 | 100.0 / 0.85 / 5.9 |
| wasp-joust-railgun-400 | 86 | 100.0 | — | 0.73 | 31.0* | 12 | 100.0 / 0.22 / 23.7* |
| wasp-cruise-bankstream | 35 | 100.0 | — | 3.36 | 13.0 | 72 | 100.0 / 0.22 / 1.5 |
| wasp-hold-G | 168 | 100.0 | — | 0.00 | 0.0 | 11 | (already muzzle) |
| wasp-boostweave-G | 60 | 100.0 | — | 0.00 | 4.8 | 18 | (already muzzle) |
| wasp-cruise-helm | 160 | 100.0 | — | 3.20 | 10.9 | 4 | 100.0 / 0.21 / 1.0 |
| wasp-rock-occluder | 161 | 84.5 | occluded 15.5% | 3.57 | 10.6 | 10 | 82.9 / 0.19 / 1.0 |
| wasp-joust-160 | 104 | 100.0 | — | 1.48 | 10.4 | 9 | 100.0 / 0.24 / 1.2 |
| dart-hold-200 | 137 | 100.0 | — | 2.59 | 11.4 | 56 | 100.0 / 0.21 / 1.3 |
| zealot-strafe-230 | 173 | 100.0 | — | 0.18 | 1.4 | 24 | 100.0 / 0.18 / 1.3 |
| wasp-hold-plasma-250 | 149 | 100.0 | — | 2.45 | 10.4 | 38 | 100.0 / 0.19 / 1.2 |
| wasp-hold-autocannon-230 | 93 | 100.0 | — | 1.46 | 9.6 | 17 | 100.0 / 0.66 / 4.2 |
| corsair-joust-railgun | 86 | 100.0 | — | 0.63 | 10.4 | 16 | 100.0 / 0.21 / 1.1 |

\* cvMiss is a constant-velocity counterfactual; it over-reads when the player is boosting or the
round accelerates after launch, so treat those two rows' cvMiss as an upper bound.

Findings:
- **Every non-exceptional round hit** (25 scenarios × 3 seeds, 3,300+ rounds). All misses were an
  asteroid or a pack-mate in the way, or the mule's point defence shooting the round down. No
  homing anywhere; rounds fly straight.
- **But the pilot/assist lead is solved from the hull centre, not the muzzle.** When the nose is not
  on the target, the systematic offset is ~3.2–3.6° (cvMiss p95 ≈ 10.9 wu against a 12-wu wasp hull):
  hits currently depend on hull size. Face-on (strafe) it is 0.2–0.3°. Solving from the real muzzle
  (the `muzzle-only` lab flag; G mode already does this via `_arcadeMountAngle`) gives 0.16–0.31°
  and cvMiss p95 ≈ 1 wu in every scenario. That is the one recommended aim change. It is tiny:
  reuse the G-mode muzzle solve in the forced-target path.
- **The oracle acceleration lead does NOT help.** Leading on the AI's instantaneous control force
  doubled cvMiss p95 (cruise 13.0 → 21.6 wu, autocannon 18.4 → 32.2) because the force is jittery.
  Keep linear lead.
- `no-spread` changes nothing at these ranges (spread is inside the hull).
- **Enemies do not exploit their dodge budget.** In up to 72% of rounds a target could have moved
  more than its hull radius before impact, and none did (0% target-maneuver misses). The reflex
  table (`volley_jink` 34-tick window / 120 cooldown, `hit_weave`) does not produce effective
  evasion. Wasps at 160 wu move at only 20–35 wu/s p50 (combatSpeed 105), and their
  `reposition: swarm_pack:extend` phase (preferredRange 240) actually closes range (118 → 66 wu in
  4 s). This is pick #4 below.
- Pulse laser sustained fire is heat-limited: 160 rounds in 3×16 s ≈ 3.3 rounds/s against rof 5.5
  (≈ 61% duty) because of the forced vent.

## 5. Other findings surfaced while building the benches (numbers from lab probes)
- **Assisted turn under throttle is path-welded** (`propulsionKernel.assistedTurnBound`): at cruise
  (195 wu/s) holding W+D the nose turns 0.96 rad/s (36% of maxYaw 2.65), giving a 217-wu turning
  radius. Holding boost gives 0.94 rad/s at 345 wu/s, a 389-wu radius; long holds drop to
  ~0.56–0.6 rad/s. Releasing W gives 3.07 rad/s of nose with zero path turn (drift). A naive "hold
  W+Shift and turn" pilot left a 160-wu orbit and drifted out to ~1000 wu.
- In the pilot scheme, holding Q/E strafe together with W and yaw pinned or snapped the nose
  (rot 2.09 → 2.10 → 0.70 → 2.04 while A was held), and the ship flew straight out of the fight.

## 6. The 10 lab systems — ranked

Ranking = (how often players hit it in common, fun flows) × (how far off the measured or likely
behaviour is) × (how hard it is to judge by eye) × (how cheap a bench is on this harness).

### 1. Tether spin / orbit assist (bench built)
- **Intent:** a tethered W+A/D spin revolves at the fastest rate the hull allows, with the nose on
  the tangent through plain spin, boost and tricks. No wrong-way turns.
- **Code / knobs:** `orbitAssist.js` (ORBIT_SWING_TRACK_MARGIN 0.9, tangentAlignTimeS 0.55, maxYaw
  clamp), `flightV3._triggerDash` (dash impulse/direction), kernel boostSpeedMult 1.55,
  hull yawAccel.
- **Metric:** eff = ω/ω* ≥ 0.97; nose p95 ≤ 5°; >90% = 0; wrongTurn = 0; flips = 0; boost gives ≥ 1.4×
  ω without breaking the nose. **Proven** = all of that on all 13 scenarios × 5 seeds.
- **Bench:** `tether` (13 scenarios).
- **Why #1:** the signature verb. Measured broken in common flows (nose 29–87°, boost collapses,
  wrong-way turns). Fix prototyped (v3-capDash).

### 2. Auto-aim / lead (bench built)
- **Intent:** a locked shot flies straight and hits unless something physically blocks it.
- **Code / knobs:** `weapons.js _leadAngle / _arcadeMountAngle`, the forced-target path, weapon
  spread, projSpeed, `autoTargetMode.tickAutoTarget`.
- **Metric:** hit% of non-exceptional rounds = 100; angErr p95 ≤ 0.5°; cvMiss p95 ≤ 2 wu across all
  scenarios.
- **Bench:** `aim` (25 scenarios).
- **Why #2:** the core combat feel. Already 100%, but with a 3.2° hull-centre offset that will show
  on small targets. The fix is one line of intent (muzzle solve).

### 3. Assisted flight turn authority + boost/drift
- **Intent:** W+turn should feel responsive at cruise, boost should feel fast but still steerable,
  and coast-drift should be a deliberate trick.
- **Code / knobs:** `propulsionKernel.js` assistedTurnBound (leadRad π/2, governorResponseS 0.9),
  coastHelmYawMultiplier, VELOCITY_VECTORING_DEFAULTS (rateLowRadS, rateCapRadS, fade*),
  `flightFeelEnvelopes`, profile mainAccel/maxYawRate/boostSpeedMult, dash impulse.
- **Metric:** turn radius at cruise and boost; time to reverse heading (180°) under W and under
  boost; slip angle p95; energy kept through a U-turn. Target bands to be set with Robin, e.g.
  cruise radius ≤ 120 wu, boost U-turn ≤ 2.5 s.
- **Bench:** `flight` — accelerate to cruise, then a held turn, U-turn, slalom through gates,
  boost-and-turn, coast-drift-and-fire. All hulls × assist modes × 5 seeds. Sweep mainAccel ×0.8–1.4,
  leadRad π/4–π/2, boostSpeedMult 1.3–1.7, vectoring rateCap.
- **Why #3:** every second of play. Measured 217/389-wu radii and a 0.56 rad/s boost turn are big;
  hard to judge by eye ("feels floaty"). Cheap: player-only world.

### 4. NPC evasion and engagement spacing
- **Intent:** enemies read as pilots. They jink under fire (some rounds should miss for real), hold
  their doctrine range, and extend when they say they extend.
- **Code / knobs:** `src/ai/reflexes.js` TRIGGERS (volley_jink window 34 / cooldown 120, hit_weave
  50/160, marked_weave), temperament.dash, `src/ai/maneuver.js` MANEUVER_SPEED_CAPS,
  `combatDoctrine.js` (swarm_pack extend, preferredRange), enemy combatSpeed/accel.
- **Metric:** evasion-caused miss% vs the auto-aim bench (target band e.g. 10–25% for agile hulls at
  ≥ 200 wu, ~0 at point blank); range-hold error vs preferredRange; extend phase actually opens range
  (Δr > 0); time-in-weapon-range.
- **Bench:** reuse `aim` scenarios with lethal-off targets, plus a `npcSpacing` scenario. Sweep jink
  window/cooldown, the dash temperament, speed caps.
- **Why #4:** measured: 0% maneuver misses with up to 72% dodgeable rounds; extend closes range;
  wasps at 20–35 wu/s. Fights feel like shooting gallery targets. The aim bench already exists.

### 5. Massline throw / sling release
- **Intent:** releasing a spun payload sends it where aimed, at the speed the spin earned.
- **Code / knobs:** `masslineThrow.js` (SNAP_WINDOW_MS 90, CURSOR_AIM_GRACE 48,
  SLING_RELEASE_SPEED_FRACTION 0, SLING_MIN_EXIT_SPEED 25, TURN_TRACK_WINDOW_TICKS 15,
  TURN_DEGRADE_RAD 0.12, throw field corridor), massline impact damage.
- **Metric:** exit speed / (ω·r) efficiency; heading error vs cursor at release; hit% on a target
  rock/ship at 150/300 wu; release-timing tolerance window (ms) that still hits.
- **Bench:** extend `tether` — spin up, release at scripted phases relative to the target bearing,
  track the payload like a round.
- **Why #5:** the trick payoff of #1; depends on spin quality, so it ranks right after it. Hard by eye
  (timing windows).

### 6. Weapon balance / time-to-kill + heat
- **Intent:** each weapon has a readable role; TTK bands per enemy class; the heat vent punishes
  spam but does not dominate.
- **Code / knobs:** `src/data/weapons.js` (dmg, rof, projSpeed, range, spread, impulsePerHit,
  heatMax), `weapons.js` WEAPON_VENT_S / WEAPON_VENT_DUMP, `combat/damage.js` (armor, shields).
- **Metric:** TTK p50/p95 per weapon × enemy (with the measured hit% folded in), duty cycle
  (measured pulse 61%), DPS-per-heat, overkill%.
- **Bench:** `aim` with lethal targets (drop invuln) → a `ttk` bench; weapons × 6 enemy types × 5 seeds.
- **Why #6:** cheap and high-signal now that aim is measured; balance is invisible to eye-tests.

### 7. Collision response / ram consequences
- **Intent:** bumps feel physical (bounce, spin) without random deaths; rams are a deliberate verb.
- **Code / knobs:** `collisionConsequences.js` (PAIR_COOLDOWN 12 ticks, tow-flail mass mults,
  tear-off counts), `tumbleStates.js` (TUMBLE_RECOVERY_S 0.9, recovery thrust 0.35, RCS 1.6 s),
  SG-02 material restitution.
- **Metric:** restitution and spin vs impact speed/angle; damage vs closing speed (monotone, no
  spikes); control-loss time; frequency of collision deaths in a 60-s asteroid-field cruise.
- **Bench:** `collision` — ship vs asteroid/ship at 30–300 wu/s × 0–80° incidence × mass ratios.
- **Why #7:** common in asteroid fields and tether play; bad values feel like bugs. Medium cost.

### 8. Target selection and lock
- **Intent:** the lock picks the target the player means (cursor proximity, threat, recency) and
  doesn't flicker.
- **Code / knobs:** `autoTargetAssist.js`, `scanner.js` (NEAR_SCAN_RADIUS 1200 …),
  `ui:targetNearestHostileToPlayer`, `resolvePlayerGunTarget`.
- **Metric:** % of picks equal to an oracle "intended" target (scripted cursor near target X in a
  pack), lock switches per minute, time-to-lock.
- **Bench:** `aim` pack scenarios with selection left to the game (the aim bench currently forces
  targetId).
- **Why #8:** the aim bench proved firing is right, so wrong-target picks are now the main way
  auto-aim could feel wrong. Cheap.

### 9. Docking corridor / autopilot approach
- **Intent:** a docking approach is quick, never overshoots or bonks the station, and the hand-off
  from manual to assist is smooth.
- **Code / knobs:** `dockingCorridor.js` (FAR_RESCAN 30, FAR_MOUTH_MULT 4, FAR_FLOOR 600),
  autopilot input resolution, the kernel closing-speed governor.
- **Metric:** time-to-dock from 600/1500 wu at various bearings and speeds, overshoot wu, contact
  speed at the mouth, collision count.
- **Bench:** `dock` — needs a station spawn in labWorld (the full bundle has the systems).
- **Why #9:** happens every station visit and is easy to get subtly wrong, but it is less fun-critical
  than combat. Needs station setup work.

### 10. Mining / drill + magnet pickup
- **Intent:** the mining loop pays at a steady pace; loot and ore come in without chasing.
- **Code / knobs:** `mining.js` (MAGNET_RANGE 800, MAGNET_ACCEL 2400, APPROACH 260–620, rich-core
  chance 0.15, window 0.12–0.22, bulk haul), `drill.js`, `lootShards.js` (LOOT_MAGNET_ACCEL 26),
  pickup acceptance.
- **Metric:** pickup time and ring-orbit count for shards (no orbiting), credits/min of a scripted
  mining loop, rich-core hit rate at human-like timing jitter.
- **Bench:** `mining` — a rock field, scripted drill and collect loop.
- **Why #10:** a core loop, but slower-paced, so off values are easier to see by eye. The bench
  needs the most new setup.

Runners-up, not picked: survival wave pacing (`survivalWavePlanner`, `difficultyDirector`), which is
a mode rather than a core verb; pursuit-slot assist (`pursuitSlotAssist.js`), which is folded into #3
via the Q/E finding; camera follow, which is not node-safe and can't run headless; economy and trade
pacing, which needs long-horizon sims beyond this harness's scope.

## 7. Sweep plan (Phase 2, ranked)

Run counts assume ~1 ms/tick in the focused bundle (a 16-s scenario ≈ 1–1.5 s wall).

| # | system | variables × ranges | runs | proven when |
|---|---|---|---|---|
| 1 | tether | v3 on; margin {0.9,0.95,1.0}; alignTimeS {0.25,0.4,0.55}; lineLock mult {1.05,1.1,1.25}; yawAccel scale on lend {1,2,4}; dash cap {track, boost, 0.8·boost} | 3·3·3·3·3 = 243 configs × 13 scen × 3 seeds ≈ 9.5k runs (~3 h) → top 10 × 5 seeds | §6 #1 criteria on all scenarios; short-line nose p95 ≤ 5°; no pump > 1.8× ω*; then a live feel check |
| 1b | tether helm | direction source: cursor sign / orbit sign latched at latch / hysteresis 0–0.5 rad | 6 × 3 scen × 5 seeds | helm-cursor flips 0, eff ≥ 0.9 |
| 2 | aim | muzzle solve on; spread {0, authored}; target radius scale {0.5, 1} (lab) | 4 × 25 × 3 | non-exceptional hit 100% at radius ×0.5; angErr p95 ≤ 0.5° |
| 3 | flight assist | mainAccel ×{0.8,1,1.2,1.4}; leadRad {π/4,3π/8,π/2}; boostSpeedMult {1.3,1.45,1.55,1.7}; vectoring rateCap {authored, ×1.5} | 96 × 6 scen × 3 | radius/U-turn bands agreed with Robin; no regression on tether eff |
| 4 | NPC evasion | jink window {20,34,50}; cooldown {60,120,180}; dash temperament floor {0.2,0.4}; extend fix on/off | 36 × 8 aim scen × 3 | maneuver-miss 10–25% at ≥ 200 wu for agile hulls, ≤ 5% at ≤ 120; extend Δr > 0 |
| 5 | sling | release window, CURSOR_AIM_GRACE {24,48,72}, release speed fraction {0,0.25,0.5} | 27 × 4 scen × 5 | exit eff ≥ 0.9, heading err p95 ≤ 3°, hit ≥ 80% at 150 wu |
| 6 | TTK | per-weapon dmg/rof ±20%, vent S {1.5,2,3} | grid per weapon (≈ 60) × 6 enemies × 3 | TTK bands per role, duty 60–80% |
| 7–10 | collision, lock, dock, mining | build bench first (≈ ½ day each), baseline, then 20–50-config sweeps | — | metrics in §6 |

## 8. Reproduce
```
npm ci --omit=dev
node scripts/lab/run.mjs tether --seeds 1,2,3 --variant baseline,comFrame,v2-capDash,v2-m95-capDash,v3-capDash
node scripts/lab/run.mjs aim --seeds 1,2,3
node scripts/lab/run.mjs aim --seeds 1,2,3 --variant muzzle-only,oracle-accel-muzzle
node scripts/lab/run.mjs aim --seeds 1,2,3 --variant oracle-accel,no-spread --scenarios wasp-cruise-160,wasp-boost-160,mule-flee-boost,wasp-joust-railgun-400,dart-hold-200,wasp-cruise-autocannon,wasp-hold-autocannon-230,wasp-boostweave-160
```
Wall time on the VM: tether 5 variants × 13 × 3 ≈ 5.5 min; aim 25 × 3 ≈ 65 s per variant.
