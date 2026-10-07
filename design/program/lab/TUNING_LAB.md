# SpaceFace Tuning Lab — notebook (Phase 1, Phase 2a in §9)

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
Phase 2a:
```
node scripts/lab/sweeps/tetherSweep2a.mjs baseline|grid|top|helm|ablate --workers 6   # resumable
node scripts/lab/sweeps/tetherSweep2a.mjs verify --workers 6   # on a production checkout with scripts/lab copied in
node scripts/lab/sweeps/tetherSweep2a.mjs report               # report.json + grid-ranked.csv
node scripts/lab/run.mjs aim --seeds 1,2,3 --quiet --variant baseline,pre-2a,muzzle-only,no-spread,oracle-accel,oracle-intent --out /tmp/aim-full.json
node scripts/lab/run.mjs aim --seeds 1,2,3 --quiet --variant half,half-pre-2a,half-muzzle-only,half-no-spread,half-oracle-accel,half-oracle-intent --out /tmp/aim-half.json
```
(`grid.w*.jsonl` raw shards are gitignored; regenerate with `grid`, about 15 min.)
Wall time on the VM: tether 5 variants × 13 × 3 ≈ 5.5 min; aim 25 × 3 ≈ 65 s per variant.

## 9. Phase 2a — systems #1 and #2 proven (2026-10-06)

Production PR branches are cut from `origin/master` d9619d568. Each carries only the production change and its tests; the lab seams stay on this branch.
- `lab2a/tether-spin` f60923e5b: orbitAssist.js, flightV3.js, input.js, the test-17 rope edit, and the new orbit-line-yaw-lock test.
- `lab2a/locked-aim-muzzle` 593488f17: weapons.js and the new aim-locked-muzzle-solve test.

### 9.1 Tether spin (#1)

**Sweep** (`scripts/lab/sweeps/tetherSweep2a.mjs`, resumable: each run is appended to `results/tether-2a/<phase>.w<k>.jsonl` and skipped on restart)
- grid: 243 configs = lineLock margin {1.05,1.1,1.25} × alignTimeS {0.25,0.4,0.55} × lend yawAccel mult {1,2,4} × governor margin {0.9,0.95,1.0} × dash cap {0.8,1,track}. Run over 15 scenarios × 3 seeds = 10,935 runs in 15.5 min (6 workers); 36 configs passed.
- top: the top 10 configs re-run on 18 scenarios × 5 seeds. All 10 passed. Best was `lm1.25_a0.25` (any yaw-accel/dash): worst nose 0.72°, min eff 1.0012, pump ≤ 1.60, settle 1.35 s. yawAccel mult and dash-cap mult barely matter.

**Helm direction sweep** (CHOSEN config, 5 seeds)

| latch | result |
|---|---|
| off | helm-cursor-spin flips 1 (active 69%), far-left eff 0.70, helm-boost eff 0 |
| aim (shipped) | 0 flips everywhere, spin-reverse keeps its expected 1 flip, nose ≤ 0.72° |
| all inputs | breaks keyboard reversal (followsIntent false) |

**Ablation** (5 seeds)

| config | result |
|---|---|
| no forwardCommit | identical to CHOSEN, so it was dropped; this keeps R2 `directionCommittedTicks === 0` |
| no heading thrust gate | spin-plain-left nose 5.3° (FAIL) |
| alignTimeS 0.55 | passes, nose 3.26°, settle 1.63 s |
| alignTimeS 0.55 + no FC + no TG | nose 16.6° (FAIL) |

**Shipped config**
- line yaw lock: margin 1.25, absolute cap 6.0 rad/s (= SG-02 `SANE_MAX_YAW_RATE`)
- yawAccel/yawBrake scaled by the lend ratio
- COM-frame swing governor 0.95
- tangentAlignTimeS stays 0.55 (pinned by master test)
- heading thrust gate cos(err)₊ in flightV3
- aim-only direction latch, engaging on the swing if it is above 25% of hull yaw
- line dash capped at the boosted cap

**Verify on the production checkout** (`verify` phase, 18 scenarios × 5 seeds = 90 runs): every criterion passes.
- worst nose 3.26° (spin-plain-left)
- min eff 1.0012
- max pump 1.611
- mean settle 1.63 s
- 0 wrong-way turns, 0 unexpected flips
- orbit/massline tests 76/76

**Before → after** (shipped master → production, 5-seed engaged window)

| scenario | before | after |
|---|---|---|
| spin-plain | nose 32.5°, eff 0.916, ω 2.67 | 0.8°, 1.065, ω 3.11 |
| spin-boost-hold | nose 34.9°, boosted eff 0.593 | 1.3°, 1.018, ω 4.64 |
| spin-short-line (36 wu) | nose 36.2° max / 32.5° p50, eff 0.460 | 1.7° / 1.5°, 1.005, ω 5.92 |
| spin-light-anchor | nose 128.5°, eff 0.626 | 1.3°, 1.176 |
| latch-moving-with | nose 75.0° | 2.7° |
| spin-reverse | nose 55.8° | 2.5° (1 expected flip) |
| helm-cursor-spin | 1 flip, eff 0.724, nose 13.0° | 0 flips, 1.068, 1.4° |
| helm-cursor-far-left | 1 flip, eff 0.667 | 0 flips, 1.068 |
| helm-boost | 1 flip, boosted eff 0.381 | 0 flips, 1.022 |
| spin-dash-spam | pump 2.02 | 1.61 |
| spin-plain-left | nose 39.3° | 3.3° |

**Short line:** this was not a physical limit. ω·r/vcap at 36 wu needs about 5.9 rad/s, which is above the hull's 2.65 rad/s yaw but under SG-02's 6.0 sanity ceiling. The line lock lends that authority, so the short line now reaches the bound with its nose at 1.7°. Lines shorter than about 35 wu (Kestrel at cruise, scaling the 36-wu bound of 5.89 rad/s) would need more than 6.0 rad/s. There the speed governor caps the swing instead of the nose falling behind; test 17 covers this at 20 wu, but the nose angle is not benched below 36 wu. (The phase-2a brief quoted 12.6°/21.6° for the short line; this bench's 5-seed engaged-window metric on current master reads 32.5°/36.2°.)

**Option:** alignTimeS 0.25 gives worst nose 0.72° and settle 1.35 s, but it needs the master test constant changed (0.55 → 0.25).

**Residual:** test 17 in massline-orbit-assist needed a 20 wu rope (it was 30 wu) to stay saturated. This is disclosed in the PR.

### 9.2 Auto-aim (#2)

**Change**
- Normal locked aim (forced target, player fixed mount) solves from the muzzle.
- `refineLeadForLaunch` re-solves against the round's real world launch velocity. The aim-true launch stops compensating once hull lateral speed exceeds projectile speed.
- `launchVelocity` is target-free (no homing; curvature ≤ 3e-6°).

**Bench** (`run.mjs aim`, 25 scenarios × seeds 1,2,3)
- Ghost-path scoring per round with a tMeet window and a 2-s no-fire tail.
- Exact intercept-direction aim error.
- Spread is removed by rotation.
- Rounds are classified as hit / occluded / pd / contact / unreachable / out-of-range / dispersion / lead-error / target-maneuver.

| variant | full-size hit / unblocked | lead-err | aim err max | half-size hit / unblocked | half lead-err |
|---|---|---|---|---|---|
| pre-2a (hull centre, no launch model) | 86.91 / 90.90 | 0.13% | up to 96° | 59.87 / 62.62 | 24.93% |
| muzzle-only | — / 94.22 | 0 | 7.6° (wasp-hold-G) | — / 87.12 | — |
| shipped (lab) | 90.78 / 94.11 | 0 | 0.43° | 84.31 / 87.79 | 0 |
| shipped (production checkout, `results/aim-2a/prod.summary.json`) | 90.78 / 94.11 | 0 | 0.43° | 84.31 / 87.79 | 0 |

**Remaining unblocked misses**
- Full size: target-maneuver 5.83% and dispersion 0.06%.
- Half size: 12.1% and 0.1%.
- Lead-error misses: 0. Every round the target did not dodge hits.

**Residual:** at half size, 4 of 3,276 rounds have aim error 0.68–1.03°, all in seed-2 boost-weave runs with tMeet 1–4.5 s. Their solMiss is ≤ 2.4 wu, inside R = 6–9 wu. Cause not isolated.

**Oracle check** (unblocked hit %)

| set | CV (shipped) | oracle accel | oracle intent (next steer target) |
|---|---|---|---|
| boost + railgun subset (7 scen), full | 88.91 | 79.91 | 84.05 |
| same, half-size | 89.64 | 73.51 | 78.18 |
| all scenarios, full | 94.11 | 86.27 | 88.47 |

Prediction error p50 at meet: CV 3.59 wu, accel 5.02, intent 4.91. CV wins, so no oracle is shipped. The only case where intent was ahead was wasp-joust-railgun, by +3.4 pts, which is noise.

### 9.3 Phase 2b order (proposed)
1. **#3 flight-assist turn authority.** Every second of play depends on it, and it sets the speeds the tether and aim benches assume. It needs Robin's radius target (default below).
2. **#4 NPC evasion/spacing.** It now owns all the remaining aim misses (5.8% full / 12% half are target manoeuvres), so this is where hit feel is tuned from now on.
3. **#5 massline sling.** Reuses the tether bench and the new line lock/latch while they are fresh.
4. **#6 weapon balance / TTK + heat.** Only meaningful once hit rates (#2, #4) are settled.
5. **#8 target selection/lock.** Cheap on the aim bench's infrastructure.
6. **#7 collision/ram.**
7. **#9 docking autopilot.**
8. **#10 mining.** Benches for 7, 9 and 10 still need building.

### 9.4 Flight-assist turn radius — recommended default (pending the #3 sweep)
**Measured (Kestrel, max yaw 2.646 rad/s)**
- cruise W+turn: 0.96 rad/s = 36% of max yaw, 217 wu radius at 195 wu/s
- boost: 0.94 rad/s at 345 wu/s (389 wu radius), decaying to about 0.56 rad/s on long holds
- coast: 3.07 rad/s, with no path turn

**Recommended targets**
- cruise: about 1.5 rad/s = 55–60% of max yaw, about 130 wu radius
- boost: about 1.0 rad/s = 35–40%, about 345 wu radius, held steady through long boosts rather than decaying
- coast: unchanged


## 10. Phase 2b (2026-10-06/07)

**Status (restart from here, 2026-10-07 01:03 ET):** #8 target lock SHIPPED as PR #233 (`lab2b/target-lock`,
not merged; see 10.6): the auto-lock takes the hostile under the mouse cursor (range weight 0.25) and waits 0.15 s
after a lost lock; intended-pick 18–52% -> 100%, 0 flicker. #6 shipped as PR #232 (10.5). Earlier: #3 PR #231,
#5 PR #230, #4 PR #229. Next: #7 collision/ram, then #9, #10. Focused tests only, per-file timeout
(`/tmp/p7/runfiles.sh`-style xargs + `timeout 120`); never the whole suite.

### 10.1 #4 NPC evasion + engagement spacing

**Bench.** `node scripts/lab/run.mjs npc [--scenarios wasp-hold,...] [--seeds 1,2,3]`. Same engine as
`aim` (`runAimSpec`, real locked aim = shipped 2a muzzle solve, invulnerable hulls so the doctrine
cycles for 24 s). Per enemy it taps the maneuver planner's own request reason
(`combat_doctrine:<id>:<phase>`) and records range, speed, preferredRange and reflex per tick.
Scored: egress legs (extend/breakaway/peel/disengage/retreat/relocate, >= 20 ticks) must end farther out
than they started and never dive > 15 wu inside their start range; orbit/hold phases on the player:
|r - preferredRange|; hit% by fire range (<=130 / 130-200 / >200 wu) and target-manoeuvre misses.
Scenarios: 9 combat types x {player holds at 300 wu, player cruises a 200-wu orbit} + wasp pack + wasp no-fire.

**Lab seams** (`src/ai/reflexes.js` `NPC_EVASION_LAB` / `setNpcEvasionLab`; empty = master):
`egressAwayCos` (egress heading clamped into a cone around away-from-target), `strikeGate` (+`strikeGateCap`:
strike max clock only runs once inside the strike band), `orbitFarClosing` (orbit closing cap lifted to the
intercept cap while > ring+60 wu out), `orbitThrottleFloor`, `jinkAuthority` (a jink/weave burst owns the
strafe channel), `jinkWindow/jinkCooldown/jinkAmpScale/jinkDashGate/jinkEta/jinkMissPad`, `weaveWindow/
weaveCooldown`, `markedAmpScale/markedMinRange`, `swarmExtendTicks/MaxTicks/Exit`.

**Baseline (master AI, 5 seeds, `baseline.w*.jsonl`):**

| type | unblocked hit% | near (<=130) hit% | far (>200) manoeuvre-miss% | egress legs | egress opened % | egress dives |
|---|---|---|---|---|---|---|
| wasp | 84.6 | 98.8 | 34.5 | 160 | 49.4 | 72 |
| corsair | 92.4 | 100 | 11.6 | 53 | 66.0 | 18 |
| reaver | 99.0 | - | 1.7 | 50 | 62.0 | 16 |
| lancer | 88.1 | - | 12.8 | 2 | 100 | 2 |
| bruiser | 99.5 | - | 0.6 | 40 | 57.5 | 14 |
| dart | 79.1 | 100 | 31.9 | 34 | 76.5 | 9 |
| ghost | 74.8 | - | 27.3 | 35 | 54.3 | 12 |
| jackal | 96.0 | 100 | 8.6 | 50 | 60.0 | 23 |
| zealot / lawman | no fight (escort with no ward parks at 460 wu; lawman is lawful) | | | | | |

All doctrines: 57.8% of egress legs open range, 166 dive inside their start range.

**Root causes (traced, `/tmp`-style probes reproduced in the bench):**
1. `combatDoctrine.egressPoint` aims the 960-wu egress point along the hull's CURRENT velocity. At the
   end of a strike that velocity still points at (or past) the target, so extend/breakaway/peel/
   disengage legs fly through the player (wasp 97 -> 38 wu; the phase-1 118 -> 66).
2. The strike never reaches its band. Swarm strike is an ORBIT at 120 wu, and ORBIT closing is capped at
   `maxOrbitClosingSpeed` 24 wu/s; strike lasts at most 44 ticks (interceptor 54) from an ingress at
   340 wu (interceptor 420). In master the pass only got close because bug 1 flew the hull through
   the player during the "extend". Fixing 1 alone parks wasps at ~290 wu (outside pulse range).
3. Enemies crawl: speed budgets are interceptSpeed 72 x hull scale x verve (reaver 44 wu/s against an
   authored 112), on-ring orbit throttle collapses to ~0 (`arrival/slowRadius`), and a volley jink only
   offsets the desired point; the strafe channel stays at 0.24 (intercept) / 0.48 (orbit) authority and
   is cut x0.35 when speed-limited, so jinks barely move the hull (wasp 20-35 wu/s p50).

**Grid (49 configs = master + egress cone 0.6 x strikeGate x orbitFarClosing x orbitThrottleFloor
{off,0.6} x jinkAuthority {off,0.7,1} x jinkCooldown {120,60}; 18 scenarios x 2 seeds = 1,764 runs,
~25 min on 7 workers; `results/npc-2b/report.json`, shards gitignored).** No config passed all criteria
under the first (raw-range) egress metric. Unblocked hit% per type (wasp / corsair / reaver / lancer /
bruiser / dart / ghost / jackal) and egress opened % / dives:

| config | hit% by type | egress open % | dives |
|---|---|---|---|
| master | 85.9 / 94.2 / 100 / 86.8 / 100 / 76.8 / 47.6 / 94.7 | 60.5 | 68 |
| egress cone 0.6 only | 71.6 / 89.8 / 91.4 / 86.8 / 97.9 / 81.3 / 47.6 / 84.6 | 72.6 | 52 |
| + strikeGate + orbitFarClosing | 78.3 / 89.5 / 89.5 / 86.8 / 97.9 / 81.3 / 47.6 / 84.6 | 77.1 | 37 |
| + jinkAuthority 1 + jinkCooldown 60 (grid best) | 68.3 / 78.0 / 94.8 / 92.0 / 97.9 / 81.3 / 66.7 / 86.8 | 80.8 | 36 |

Read-outs:
- The egress cone is necessary but not sufficient: fixing only the egress point parks swarm hulls
  outside pulse range (the pass never closed; see cause 2). strikeGate + orbitFarClosing restore the pass.
- jinkAuthority is the knob that turns the jink into real misses (wasp far-range manoeuvre misses
  ~40%, corsair ~25%); 0.7 vs 1.0 trades wasp hit% for corsair hit%.
- The raw-range egress metric is confounded by (a) the cruising player's own motion and (b) the hull's
  entry momentum (a wasp entering at 60 wu/s inward needs ~19 wu to stop). The bench now also scores
  OWN-motion egress (enemy radial velocity integrated over the leg, outward by the last third, inward
  carry <= braking distance from entry speed + 15 wu); `top` and `judge` use it.
- Separate finding, not fixed here: interceptor-flyby hulls (reaver) thrash their heading during the
  crossing-lane strike (angle error swings +-1.5..3 rad tick to tick even with no incoming fire) and
  creep at 15-25 wu/s against a 44 wu/s budget; their passes rarely reach the 150-wu band. Ruled out:
  ship-collision avoidance (disabling it changes nothing). The likely cause is yaw-controller overshoot
  (angular velocity ~4 rad/s against turnRate 1.55, `yawRateTorqueFor` plus physics). Needs its own trace.

**top (9 configs x 5 seeds) and top2 (12 configs x 5 seeds, `egressTrack`).** The best `top` config
(cone 0.6 + strikeGate + orbitFarClosing + jinkAuthority 1 + cooldown 60) reached 72% own-motion
egress-open with 70 dives. The remaining failures were mostly cruise scenarios, because the stored egress
point goes stale as the player moves. New seam `egressTrack`: re-aim a committed egress point into the away
cone against the LIVE target whenever its bearing leaves the cone. With it, top2 reached about 86% open and
40 dives. Most of the "dives" left were 17-30 wu of entry momentum on hulls that need about 1 s to turn.

**Criteria revised after top2 (decision, before top3).** (a) Dive allowance = quarter turn at the hull's
turn rate at entry speed + braking distance + 15 wu (it previously had no turn time); criterion is dives
<= 1% of legs. (b) The medium-hull hit ceiling moved from 92% to 97%: the reaver sits at 92-97 depending on
jink authority, and Robin wants shots to land. The other bands are unchanged: agile 60-85, heavy 80-97,
near (<=130 wu) >= 85%, agile far manoeuvre-miss >= 8%.

**top3 (7 configs x 18 scenarios x 5 seeds; adds `swarmExtendMaxTicks` 150).** wasp-hold-nofire showed the
90-tick swarm extend ends before a wasp has turned off the pass (extends ended at 131-167 wu). At 150
ticks they end at 200-275 wu.

| config (all + egressTrack + strikeGate + orbitFarClosing + extend 150) | egress open | dives | hit% wasp/cors/reav/lanc/bru/dart/ghost/jack |
|---|---|---|---|
| master | 43.4% | 119/389 | 84.6/92.4/99.0/88.1/99.5/79.1/74.8/96.0 |
| cone 0.8, jink authority 0.7 (**shipped**) | **91.6%** | **2/286** | 76.0/82.6/96.7/87.5/95.1/78.4/73.8/87.1 |
| cone 0.8, jink authority 1.0 | 92.7% | 3/287 | 69.5/81.1/92.0/85.9/94.5/78.4/65.1/84.8 |
| cone 0.6, jink authority 1.0 | 90.2% | 2/296 | 70.7/79.7/94.7/85.9/97.8/82.1/65.1/86.1 |
| cone 0.8, no jink authority | 88.9% | 6/~290 | 80.5/89.9/97.6/88.1/98.6/78.4/74.8/90.7 |

Only the shipped config passes every criterion. Jink authority 1.0 also clears the egress criteria but makes
ghost and wasp slippery (65-70%).

### 10.2 #4 shipped: PR #229 (`lab2b/npc-evasion`)

Production change, with no seams:
- `combatDoctrine.js`: `EGRESS_AWAY_MIN_COS` 0.8 clamp in `egressPoint` plus `trackEgressPoint` for the
  extend/breakaway/peel/disengage/escape phases; strike clock from band entry (`INTERCEPTOR_STRIKE_BAND_WU`
  225, `SWARM_STRIKE_BAND_WU` 180, `STRIKE_CLOSE_CAP_TICKS` 240); `SWARM_EXTEND_MAX_TICKS` 90 -> 150.
- `maneuver.js`: `orbitFarClosingMargin` 60 / `orbitFarClosingScale` 1.5; `reflexStrafeAuthority` 0.7 for
  volley jink / hit weave (no x0.35 cut, emergency slew).
- Tests: new `test/sf-2b-npc-evasion-spacing.test.mjs` (6 cases, all fail on master); `pq206-01` updated (a
  pass 330 wu out keeps striking until the 240-tick cap). AI suite: 660/662; the 2 failures
  (`doctrine-distinct`, `fb-telegraph-every-archetype`) also fail on clean master.

**Verify on the production checkout** (scripts/lab copied in, #228's `weapons.js` applied temporarily for the
locked aim, 90 runs, `results/npc-2b/verify.w*.jsonl`): the numbers are byte-identical to the top3 seam row.
Every criterion passes.

| type | hit% master -> PR | egress open (PR) |
|---|---|---|
| wasp | 84.6 -> 76.0 | 93.3% (89 legs, 0 dives) |
| corsair | 92.4 -> 82.6 | 85.7% (49, 1) |
| reaver | 99.0 -> 96.7 | 97.6% (42, 0) |
| lancer | 88.1 -> 87.5 | 100% (1, 0) |
| bruiser | 99.5 -> 95.1 | 91.4% (35, 0) |
| dart | 79.1 -> 78.4 | 86.7% (30, 1) |
| ghost | 74.8 -> 73.8 | (no egress legs; ranged stalker) |
| jackal | 96.0 -> 87.1 | 92.5% (40, 0) |

Wasp extend (sampled legs): mean range 182 -> 184 wu with own radial -6 wu on master, against 191 -> 267 wu and
+67 wu on the PR.

**Dependency.** Without #228 (master's old aim, `verify-masteraim.w*.jsonl`) the same change gives ghost
50.5% and dart 86.5%, both outside their bands; egress still passes (93.2%). Merge #228 first or together.

Re-run: `LAB_OUT=/tmp/npc-verify node scripts/lab/sweeps/npcSweep4.mjs verify --workers 6`, on a checkout of
the PR (+ #228) with `scripts/lab` from this branch.

### 10.3 #5 massline throw / sling release: shipped as PR #230 (`lab2b/sling-release`)

**Bench.** `sling` (`scripts/lab/benches/slingThrow.mjs`):
- Each press is a fresh world. A Space tap latches the payload; the spin is W+D (with Shift for boost)
  under the PR #227 orbit lock.
- The cursor aims at the target, and RMB `throwArm` is forced at the press tick.
- Presses sweep from 5.0 s every 2 ticks for 120 ticks, which covers 1–2 revolutions.
- Scenarios: light (20) or pair (60) payload; target at 300 or 150 wu; a small r10 target moving at
  40 wu/s; boost; and a long pair spin. Seeds 1–3.

Sweep: `scripts/lab/sweeps/slingSweep5.mjs` (phases baseline / grid / verify / report).

**Baseline (master throw on the #227 spin):**
- Hit window: 135.1 ms per revolution. Early tolerance −74.6 ms, late +15.1 ms.
- Snap cuts hit 97.7% (100% on static targets).
- Exit speed kept: min 0.977 (a pure cut).
- Latch failures: 0.
- **14 of 101 queued presses missed.**

**Root cause.** The snap queue forecast models a coasting swing. Under thrust the real window opens
0–1 ticks *after* the forecast:
- Light payload under thrust: {0: 33, 1: 11}.
- Pair payload under thrust: {0: 9, 1: 33}.

The fixed deadline, floor(90 ms) = 5 ticks, then cut an accepted press one tick early, off solution.

**Fix.** Deadline = forecast entry tick (ceil) + `SNAP_DEADLINE_SLACK_TICKS` (1). The window dial is
unchanged. Grid results (ms/rev, queued misses), master deadline → entry+1:

| window | master deadline | entry+1 |
|---|---|---|
| 90 ms | 135.1 (14) | 147.1 (3) |
| 120 ms | 175.3 (15) | 187.3 (4) |
| 150 ms | 209.6 (11) | 217.5 (4) |
| 200 ms | 275.7 (14) | 284.4 (6) |

Wider windows are Robin's feel call and are listed in the PR.

**Production verify.** Results are in `results/sling-2b/verify-*/` (each with `table.txt`).
- On the #227 spin, master → PR:
  - ms/rev: 135.1 → 147.1
  - queued misses: 14 → 3
  - snap hit rate: 97.7% → 97.9%
  - exit speed kept: 0.977 both
  - latch failures: 0 both
- The verify reproduces the lab numbers exactly.
- On master's spin: queued misses 4 → 3 of 15. Most scenarios produce no hits at all on that spin, which
  is #227's problem, not the throw's.

**Residual.** The 3 remaining misses are all light-300-small seed 2 (moving r10 target, missed by
0.52 wu). The forecast does not model target motion.

**Tests.** The deadline test pins entry+1. A new test (a window that opens one tick late still releases
on solution) fails on master. Massline suites pass 430/430.

### 10.4 #3 flight-assist turn authority: shipped as PR #231 (`lab2b/flight-turn`)

**Bench.** `flight` (`scripts/lab/benches/flightTurn.mjs`; `run.mjs flight [--variant sf2b3|sf2b3-strict]`).
Player-only world, pilot scheme (A/D yaw, Q/E strafe), 15 hulls. Scenarios:
- cruise-turn: W to cruise (6 s), then W+D for 8 s.
- boost-turn: W+Shift to the boost cap, then W+Shift+D for 12 s. Early (1–3 s) vs late (9–12 s) gives the
  decay.
- coast-turn.
- uturn-cruise / uturn-boost.
- strafe-yaw: W+E+A, W+Q+D and W+E+D.

Every rate is also given as a fraction of the hull's max yaw. The all-hull helper is
`results/flight-2b/quick.mjs` and the table helper is `tab.mjs`.

**Root causes (Kestrel).**
- Cruise W+turn: the vectoring force was clamped to `limits.forward`. That gave 0.88 rad/s = 0.33 of max
  yaw at 195 wu/s, saturated 100% of the time.
- Boost at the cap: 0.556 rad/s = 0.21 of max yaw, steady on a 12 s hold. The "decay" seen earlier is the
  rate falling as speed builds toward the cap.
- Nose snap: with Q/E held, the nose-vs-trail lead bound read the requested ~45° crab as excess lead. On
  master, W+E+A turns the nose +3.94 rad *against* A in 3 s (kernel test).

**Change (the defaults are the dials).** In `VELOCITY_VECTORING_DEFAULTS`:
- `restYawFrac` 0.60, `cruiseYawFrac` 0.57 (combat cap), `boostYawFrac` 0.375 (boost cap).
- The rate follows speed between the anchors, with constant lateral acceleration above the boost cap.
- The rate is scaled by the drive's share of its nominal forward authority.
- `legacyFloor` true: never below the pre-#3 rate. The floor only binds on the slow-yaw torch hulls
  Hawser, Colossus and Leviathan. Applied strictly, the fractions would slow those hulls by about 40%
  (colossus could no longer finish the cruise U-turn in 8 s).
- When Q/E is held, the lead bound measures nose + strafe offset against the trail. Telemetry still
  reports hull vs trail.
- Packets that pass `rateLowRadS`/`rateCapRadS` explicitly keep the legacy schedule.

The lab seam `FLIGHT_TURN_LAB` is empty = master (byte-identical on the bench). `{yawFrac, commandSlip,
legacyFloor, *YawFrac}` selects the new behaviour.

**Production verify (all hulls, seed 1).** Results in `results/flight-2b/verify-prod/table.txt`; they are
identical to the lab candidate.

| hull | cruise frac (r) | boost frac early/late (r) | U-turn cruise/boost s | W+E+A |
|---|---|---|---|---|
| kestrel | 0.33 (222) → 0.58 (128) | 0.21/0.21 (543) → 0.375/0.375 (305) | 3.62/5.68 → 2.12/3.22 | against → with |
| wasp | 0.27 (220) → 0.58 (100) | 0.23 (412) → 0.38 (249) | 3.33/3.88 → 1.55/2.37 | against → with |
| pelican | 0.30 (311) → 0.57 (165) | 0.19 (757) → 0.38 (391) | 5.05/7.83 → 2.72/4.12 | against → with |
| drifter | 0.30 (303) → 0.57 (158) | 0.19 (736) → 0.38 (374) | 4.92/7.58 → 2.60/3.93 | against → with |
| mule | 0.44 (339) → 0.58 (261) | 0.39/0.30 → 0.44/0.38 (580) | 6.32/7.85 → 4.90/6.65 | against → with |
| atlas | 0.44 (339) → 0.58 (261) | 0.43/0.23 → 0.43/0.29 (980) | 6.32/7.33 → 4.90/6.92 | against → with |
| hawser / colossus / leviathan | unchanged (floor) | unchanged | unchanged | against → with |
| hornet, bastion, warden, saucer | unchanged (non-vectoring drives) | | | already with |

- Speed kept through a U-turn: 1.00.
- Coast: unchanged.
- Held-turn slip p95: 6.5–7°.
- Atlas passes its boost cap on a long boost (travel burn at 320 wu/s) and rides the floor there.

**Interaction re-checks** (production checkout, with the other PR's `src` applied; results in
`results/flight-2b/xcheck-before/` and `xcheck-with3/`):
- **#227 tether**, verify 18 scenarios × 5 seeds: worst nose 3.26°, min eff 1.0012, pump 1.611, settle
  1.627 s. All pass, identical to #227 alone (the orbit assist owns the tethered turn).
- **#228 aim**, 25 scenarios × 3 seeds, `scripts/lab/sweeps/aimRun.mjs`:
  - Full size: 90.78 / 94.11 → 92.18 / 95.50 (hit / unblocked), aim error max 0.43° → 0.47°.
  - Half size: 84.31 / 87.79 → 83.16 / 86.77. The extra misses are target-maneuver (11.6% → 12.6% of
    rounds; the player fires 9% more rounds).
  - Half-size aim errors over 0.5°: 4 → 1 (max 1.03° → 0.58°).
  - Lead-error misses: 0 throughout.
- **#229 NPC (with #228)**, verify 18 × 5:
  - Egress legs that open range: 91.6% → 94.5%. Dives: 2 → 1.
  - **The player turns harder, so hit rate rises.** Reaver goes 96.7 → 97.7 (band 70–97) and bruiser
    95.1 → 98.0 (band 80–97), just over #229's upper bands.
  - Other archetypes: wasp 76.0 → 78.8, corsair 82.6 → 84.0, lancer 87.5 → 85.1, dart 78.4 → 78.3,
    ghost 73.8 → 72.9, jackal 87.1 → 90.4.
  - This is flagged in PR #231. **Decision (Robin, 2026-10-07):** accept it. Shots should land, and these are the
    heavy, slow enemies. The upper bands in the #229 bench criteria are raised to 99% for reaver (70–99) and
    bruiser (80–99) only (`TYPE_BANDS` in `npcSweep4.mjs`). No production change. Re-judged with #231 applied:
    all bands pass.

**Tests.**
- `velocity-vectoring`: the schedule assertions now follow the yaw-fraction contract; the authority-bound
  test covers the legacy variant.
- Three new tests (targets, floor, nose snap) all fail on master.
- `lg-turn-radius`: the in-game turn line already comes from the kernel. Only the guard against the old
  yaw-cap guess moves (≥ 100 → ≥ 40).
- Flight/kernel suites 966/995 and UI turn-text suites 32/33. All remaining failures also fail on clean
  master.

**Candidate follow-up (not fixed here): Ironback and Ranger W+turn path.**
- Neither hull bends its path under W+turn on master or on this PR. Ironback (pulse-plate drive): cruise
  path 0.01 of max yaw, radius ~24,000 wu, no cruise U-turn in 8 s. Ranger (field-sail drive): 0.
- Under W+E+A both drift slightly the wrong way, but they barely turn at all, so this is near noise.
- `test/lg-turn-radius.test.mjs` pins their in-game turn line as empty (radius 0), so this looks
  authored rather than a bug. Still, a sail or pulse barge that cannot be steered by W+turn at all is
  worth a feel review with Robin.

### 10.5 #6 weapon balance (TTK + heat): shipped as PR #232 (`lab2b/beam-armor`)

**Bench.** `node scripts/lab/run.mjs ttk --scenarios pulse_laser_s|reaver_pirate|dummy` (module
`scripts/lab/benches/ttk.mjs`). Scenario id `<weapon>|<enemy>|dummy|live`. S weapons on the Hitch (+ ion engine,
shield booster), M weapons on the Drifter's forward M hardpoint; one weapon fitted, shooter invulnerable, pinned at the
origin, nose yawed onto the target with A/D, fire from tick 20. `dummy`: enemy re-pinned at 150 wu every tick (perfect
hits, 60 s cap). `live`: real SG-06 AI at 220 wu, 8 npc-bench types × 3 seeds. Enemy at `levelRange[0]`. Metrics:
eHP (shield+armorHp+hull), TTK from first shot, rounds/s, vents, duty (1 - vent-locked share), heat peak, dmg/hit,
dps. Sweep: `scripts/lab/sweeps/ttkSweep6.mjs baseline|probe|verify --workers 6` (560 jobs, ~1.6 min; resumable
JSONL in `results/ttk-2b/`). Tables: `node design/program/lab/results/ttk-2b/tab.mjs <dir> <phase> dummy|live`;
A/B: `cmp.mjs <dirA with baseline.*> <dirB with verify.*>`.

**Baseline (dummy TTK s, master).** Starter Pulse S vs the `enemies.js` contract (dmg 8, perfect hits; measured
*with* the vent): wasp 3.0 (~3 ✓), reaver 10.1 (8–10, at the edge), corsair 17.7 at its minimum L4 (~15, +18%; live
22.9), bruiser 31.8 (killable ✓). Pulse S duty 0.72 (vent rhythm, 4.2 rounds/s vs rof 5.5) — inside the 60–80% band.
Field anchor (L5, 866 eHP) is 54 HP short at the 60 s cap with Pulse S — mid-game specialist, not immune.
M guns: Pulse M / Heavy AC M / Bank Stream M ~12–21 s on a bruiser, plasma 6.3, railgun 11.4, missiles 10.6.
Railgun and missile misses vs mule/customs/patrol/mine-layer/PD-screen/field-anchor are point-defense intercepts
(hits/shots 4/31 etc.), the designed counter. Concussion S/M, RCS disruptor are momentum/disable verbs (authored
7–22 dps) — slow kills by design. Flak S: 9.7 dps on a bruiser (PD role).

**Defect 1 — beam vs flat armor.** Beam Laser M: 46 dps on a wasp (flat 0), 6.8 on a reaver (flat 1), 1.9 on a
bruiser (flat 3); 7 of 16 types not killed in 60 s. Cause: `damage.js` subtracts `armorFlat` per packet and a beam
sends one ~1-damage packet per tick (`combat._applyBeamDamage`). Same class of defect `planetRuntime` already batches
around. Fix: beam packets carry `armorFlatScale = dt / BEAM_ARMOR_PACKET_S`. Window probe (dummy TTK s):

| window | reaver | corsair | bruiser | warden | field_anchor |
|---|---|---|---|---|---|
| master (per tick) | 29.3 | -- | -- | -- | -- |
| 0.1 s | 5.0 | 12.2 | 21.1 | 25.3 | 32.6 |
| 0.18 s (= Pulse S cadence) | 4.7 | 10.5 | 16.1 | 19.3 | 24.8 |
| **0.25 s (shipped)** | 4.6 | 10.1 | 14.9 | 17.9 | 23.1 |
| 0.5 s | 4.5 | 9.5 | 13.6 | 16.4 | 21.1 |
| no flat at all | 4.4 | 9.1 | 12.6 | 15.2 | 19.4 |

0.25 s = the beam reads to armor like a 4-rps gun (flat 3 costs 12 of 60 dps, ~20%, similar to what flat costs Pulse M).

**Defect 2 — beam never vented.** `_serviceBeam` clamps heat at heatMax; `_tickWeapons` dissipates before its vent
check, so a clamped beam was always just under heatMax when checked: 0 vents, duty 1.00, 60 ray-ticks/s forever.
Fix: `_beginVent` on peg (the projectile paths already do). Beam duty 0.77 (2 vents/kill), Dreadnought heavy beam
vents too (pegs ~3.7 s). Legacy 47-A profile has the vent off: unchanged.

**Verify (production checkout, master d9619d568 vs PR #232, same harness).** 529/560 rows bit-identical (live rows
included); all 31 changed rows are Beam Laser M. Beam dummy kills 9/16 -> 16/16; live 15/24 -> 19/24 (corsair 0/3 ->
1/3, quiet ghost 0/3 both — stationary bench pilot, beam range 240 lets them kite; 563/2424 ray-ticks on the corsair).
Beam dps reaver 6.8 -> 31.4, bruiser 1.9 -> 25.6. Lab seam (`setWeaponBalanceLab({beamArmorPacketS:0.25,
beamVent:true})`) reproduces the PR rows 40/40. Tests: `test/beam-armor-flat.test.mjs` 5/5 (all fail on master);
359 related test files 2931 tests, the same 26 pre-existing failures as master (by name). Results:
`results/ttk-2b/verify-prod/{master,armor-only,pr232}`.

The lab baseline on this branch differs from the master checkout in live rows for every weapon (lab branch base
drift, not noise: master-vs-PR on one checkout is bit-identical outside the beam). Use `verify-prod/master` as the
reference.

**Candidates for Robin (not changed):**
- Corsair TTK with the starter is 17.7 s dummy / 22.9 s live vs the ~15 s contract (+18%). Lever: corsair hull/shield
  or Pulse S heat (`heatDissip` 12). Reaver at 10.1 sits on the 8–10 edge.
- After both fixes the tier-3 beam is slower than tier-2 Pulse M / Heavy AC M on heavy armor (bruiser 21.8 vs 12.4 s);
  its edge is hitscan. Levers: `heatPerSec` 55, `heatDissip` 22, `range` 240 in `src/data/weapons.js`.
- Pulse M, plasma, railgun, missile, EMP carry no heat fields at all (duty 1.00) — authored, but they never meet the vent.

### 10.6 #8 target selection / lock: shipped as PR #233 (`lab2b/target-lock`)

**Bench.** `node scripts/lab/run.mjs lock` (`scripts/lab/benches/targetLock.mjs`). Real path: autoTargetAssist's quiet
refresh emits `ui:targetNearestHostileToPlayer`; the bench wires uiRoot's exported `targetNearestHostileToPlayer` to
the bus (uiRoot is not a sim system). Hitch at the origin, wasp packs pinned at seeded bearings/ranges 150–900 wu
(>= 90 apart), cursor (pointer live) on a seeded intended contact. Families: pick-4/6, pick-6j (cursor up to 60 wu
off), chain-4/6/6j (kill the lock via combat.onHit, cursor moves to another), chain-6d15/d/d40 (cursor waits 0.15/
0.25/0.40 s after the kill), threat (wasp 70 wu behind, cursor 600–900 ahead), nopointer-4, live-4 (AI free, 20 s,
lock switches/min). Sweep `scripts/lab/sweeps/lockSweep8.mjs baseline|probe|verify` (40 seeds, live 5; ~15 s).
Table: `node design/program/lab/results/lock-2b/locktab.mjs <dir> [phase]`.

**Finding.** Master always locks the nearest hostile (every pick in every family = nearest): intended 18–52%,
threat 0%. With a lock, auto-aim overrides the cursor, so after each kill the guns swing to the closest contact.

**Probe.** Cursor-point cost `|h - cursor| + w·|h - player|`: w 0–0.25 = 100% everywhere; 0.5 = 99–100%; 1.0 =
83–92% under jitter; 2.0 ~ back to nearest. Bearing form (distance to the aim ray at the hostile's range): 90–98% at
w 0.1 — worse for a mouse, kept out. Immediate re-pick + reaction delay: 60% (cursor still on the wreck). Grace
0.15 s (quantised by the 0.12 s refresh -> 0.232 s gap/kill) = 100% for reactions <= 0.25 s; 0.35 s covers 0.40 s at a
0.34 s gap.

**Shipped.** w 0.25, grace 0.15 s, cursor only with `aimIntentActive`, not G mode, not pad (`inp.aimFromStick`,
minted only in the pad branch of input.js). Verify (production checkout): master vs PR as in the table above; lab
seam reproduces it. Tests: `test/target-lock-cursor-pick.test.mjs` 7 (5 fail on master); 149 focused files with a
120 s per-file timeout: the same 9 pre-existing failing files on master. Results `results/lock-2b/verify-prod/`.

**Also fixed (same PR, own commit):** `test/golden-wreck-thread.test.mjs` defaulted its scratch dir to
`C:/Users/93rob/...`, which created `./C:/` in the worktree on Linux; now `os.tmpdir()`.

**Candidates (not changed):** pad/stick aim still picks nearest (needs a bearing score of its own); Tab cycle is
distance-ordered; with a 0.40 s reaction the grace is too short (58%).

### 10.7 #7 collision response / ram consequences: PROVEN against its contracts, no PR

**Bench.** `node scripts/lab/run.mjs collision` (`scripts/lab/benches/collision.mjs`). Real rapier-dynamic +
collisionConsequences + impulseKernel + tumbleStates. Impact grid: mover (wasp, corsair, reaver, bruiser, player) x
target (static asteroid r22, loose 60-mass rock, bruiser, wasp) x 20–300 wu/s x 0/30/60/80° incidence. The mover is
carried kinematically (pose + velocity written after each step) until first contact, then released — a helmed hull's
flight cap would otherwise clamp the approach to its maxSpeed. Plus `cruise|v` (player lane through a rock field) and
`field|wasp|mixed|sparse|dense` (live AI pack fights an invulnerable circling player inside a seeded field for 60 s;
counts NPC rock contacts, tumbles, collision kills and who caused them). Table: `results/collision-2b/coltab.mjs <dir> [angle|all]`.
Seam (off by default): `setCollisionLab({ selfCrashCap })`.

**Findings (baseline, results/collision-2b/grid, field).**
- Damage vs closing speed is monotone with no spikes, but it SATURATES early: the terrain crumple law (threshold 30,
  cap 400·clamp(16/m)) reaches each hull's cap at ~56 wu/s, so 60 and 300 wu/s rock hits do the same damage
  (corsair 38%, reaver 44%, bruiser 14% of toughness).
- Light hulls die to any head-on rock hit at >= 50 wu/s (a Wasp at 48% of its 105 combat speed). This meets the
  authored B6 "terrain is lethal" contract (`test/terrain-slam.test.mjs`: light hostile at 50% of cruise loses
  >= 60%, dies at 75%), so it is by design.
- Live dense field: 6 NPC deaths in 40 fights x 60 s (one per ~6.7 min), all `direct_contact` crediting the NPC
  itself (its own piloting), none player-caused. Sparse field: 0.
- NPC bounce: normal restitution 0.05–0.3 off rock (scraping material), spin 0–6 rad/s; terrain hits >= 18 dv tumble.
- Player: zero hull damage at any speed (contract: impact damage is NPC-only); head-on into a static rock the player
  stops dead (restitution 0.00 at 20–300 wu/s, no spin); off a loose rock 0.2–0.36, off a wasp 0.4–0.6. Helm never
  lost; cruise at 80–260 wu/s: 0 deaths, 0 helm-loss.
- Grazes (60–80°) carry radial closing only (~30 wu/s at 150): no damage, restitution ~0.8. Correct.

**Probe: self-crash cap** (one self-piloted crash takes at most k x full toughness). Field kills 6 -> 0 at k 0.25/0.35,
2 at 0.5. But it breaks 10 contract test files (terrain-slam B6, terrain-damage-law, kill machines, sling-throw,
field-routes …) even narrowed to `direct_contact` self only, because the contracts author terrain as lethal. Not
shipped; kept as `results/collision-2b/selfcrash-candidate.patch` (+ test) for Robin.

**Candidates for Robin (not changed):** (1) NPC self-crash deaths (~1 per 7 min in dense fields) — keep B6 or cap
self-piloted crashes (patch ready, k 0.35); (2) damage saturates at ~56 wu/s, so a 300 wu/s ram reads the same as a
60 wu/s bump — a wider crumple ramp would make speed matter; (3) the player stops dead on rock (no bounce/spin) — the
scraping material + give rule is deliberate, but the intent line asks for "bounce, spin".

