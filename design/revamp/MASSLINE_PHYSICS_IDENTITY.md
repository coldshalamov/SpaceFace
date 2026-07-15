# MASSLINE PHYSICS IDENTITY — Design Decisions (Wave M2)

Status: AUTHORITATIVE for the massline2 implementation pass (2026-07-12).
Companion to the handoff brief; this file records the *chosen* model where the brief
granted latitude. Mechanics reference for what already shipped: `docs/MASSLINE_MECHANICS.md`.

---

## 1. The intent model (§3.7 solved)

The same primitives (tether + target + release) meant four different things. The chosen
disambiguation rests on one sentence the player can internalize:

> **F frees YOU. RMB throws THEM. LMB shoots.**

| # | Tethered to | Player intent | Verb | What the game does |
|---|---|---|---|---|
| A | hostile ship | "guns on him while I fly" | **hold LMB** | tether-lock fire control: guns solve the constrained motion and land shots; no aiming needed |
| B | anything | "sling MYSELF at my destination" | **tap F** (plain cut) | you exit ballistic; if a nav/combat target is selected, the release indicator shows YOUR exit solution and the cut snap-assists within the window |
| C | rock / wreck / cargo | "throw the MASS at that" | **hold RMB** (throw-arm) | indicator locks to throw-aim (entity under cursor, else selected target); line auto-cuts on the next solution frame |
| D | hostile ship | "throw HIM at that" | **hold RMB** (same verb) | identical mechanics; payload is the tethered enemy |

Design consequences:

- **Case A is not a release verb.** It is continuous while latched, which removes it from
  the release ambiguity entirely.
- **The payload identity is carried by the button, not the target type.** F's payload is
  always the player; RMB's payload is always the tethered mass. No mid-fight retargeting
  dance, no radial menus.
- **The indicator always announces the armed verb** (see §4): self-exit chevron when no
  throw is armed, payload arc + target bracket while RMB is held. "Always show the player
  what will happen before it happens."
- RMB normally fires weapon group 2 / mining beam. **While latched to a throwable payload
  (ship/drone, fracture chunk, cargo mass) and the feature flag is on, RMB is the throw
  verb instead.** While latched to a mineable **asteroid or wreck**, RMB stays the mining
  beam — tether station-keeping for extraction is the designed dance partner (playtest
  dial; see `isThrowArmPayload` in `input.js`).
- Physics already enforces the anchor/payload split: asteroids/stations are immovable
  anchors (invMass 0 / non-dynamic) — you swing off them (B); ships, drones, salvage
  wrecks (mass 1800), chunks and pickups are dynamic — they can be thrown (C/D).
- Context attachment resolves once at latch: hostile craft retain the aimed nose/surface line;
  towable dynamic bodies use COM-to-COM anchors so neither endpoint gains accidental steering
  torque; immovable terrain keeps its readable surface endpoint.

## 2. Input map (key verbs rebindable; contextual mouse verbs remain fixed)

| Input | Action | Notes |
|---|---|---|
| F tap / hold | latch–cut / reel (UNCHANGED) | locked input contract stays intact |
| LMB | fire (UNCHANGED); solution-gated while tether-locked | §3 |
| RMB (tether latched) | `throwArm` (level) | contextual mouse verb; falls back to mine/group-2 when not latched; intentionally not a rebind row |
| CapsLock | `bulletTime` (level, hold) | every letter key A–Z is already bound; CapsLock is the reachable free key next to WASD. Rebindable. |
| Backquote (`) | `cloakToggle` (edge) | the other free left-pinky key; non-twitchy verb. Rebindable. |
| Tab | cycle target (UNCHANGED) | selects throw/self-sling targets as before |

## 3. Tether-lock fire control (§3.1)

- New pure module `src/combat/tetherFireControl.js`: `solveTetherLeadAngle(player, target,
  projSpeed, telemetry)` — constrained-motion intercept. While the line is taut, the
  target's future position is extrapolated on the rotating line frame (angular rate ω =
  tangentialSpeed/distance about the shared mass-weighted center, COM advected by its own
  velocity), 3 fixed-point iterations; slack line falls back to `solveLeadAngle`.
- `weapons.js` player path (flag `masslineFireControl`, browser-on/golden-off): when the
  player's tether target is a hostile ship/drone, it becomes the auto-aim target without
  requiring the G toggle, aim uses the constrained solver, and **held fire only releases
  shots on solution frames** (aim error under a tolerance that scales with target angular
  size) — sustained LMB reads as the guns *tracking*.
- Untethered fire is untouched. NPCs never get the solver (player-side only).

## 4. Throw system + release assist (§3.3, §4.1)

New system `src/systems/masslineThrow.js` (registered after `masslineImpacts`; NOT added
to the sf-sim curated list) + runtime mirror under `state.massline2.throw`:

- **Spin-up is the existing reel** (conservation of angular momentum through the Rapier
  constraint — already real). Telemetry already measures tangential/angular speed.
- **Solver**: payload (tethered mass for RMB, player for F) is released ballistic; the
  solution frame is when the payload's velocity vector intercepts the aim target (moving
  targets use the standard 2-pass intercept at payload speed). Solution error ε sweeps
  through 0 once per revolution; time-to-solution ≈ ε/ω feeds the indicator ramp.
- **Assists** (dial `massline2.releaseAssist`: `'arm'` default | `'snap'` | `'off'`):
  - *arm*: while RMB is held, the cut executes automatically on the first tick ε enters
    the tolerance window (works entirely on the early side of the moment — Robin's
    asymmetry note).
  - *snap*: a manual release within ±`SNAP_WINDOW_MS` (default 90 ms) of the solution
    executes at the solution frame (early press defers to it; a late press inside the
    window applies a bounded exit-angle correction ≤ the tolerance — the only "soft"
    physics in the feature, bounded and dial-gated).
  - Self-sling (F) gets the *snap* treatment against the selected nav/combat target.
- **Target-size honesty**: tolerance = atan((victimRadius × `assistForgiveness`) /
  distance) clamped to [0.5°, 12°]. Stations/big rocks are easy; fighters stay a
  low-percentage showoff play.
- **Slingshot bonus (§4.1, approved hack)**: on a *self* release from a massive anchor,
  apply a bounded exit impulse `anchorMassBonus = clamp(log10(anchorMass/shipMass), 0, 3)
  × `slingBonusPerDecade`` along the exit vector via `helpers.combatPhysics.applyImpulse`
  (browser-flagged). Bigger anchor = mightier fling.
- Speed cap: exits are physics-earned velocity. `tetherGameplay` grants the existing one-second
  `state.player.tether.slingshot/slingshotT` tag on a qualifying cut, while `masslineThrow` emits
  `massline:selfSling` for the assisted anchor-mass release. The live V3 flight adapter consumes
  both signals: the assisted governor uses a six-second exponential target during the bounded
  grace window and scales vector-destroying neutral/lateral assist to 0.24. Ordinary thruster
  acceleration still converges to the authored combat-speed cap, and explicit brake retains full
  authority. This was implemented in the flight lane after its earlier ownership constraint was
  explicitly superseded; legacy `flightDynamics.js` remains untouched.

## 5. Bullet time (§3.6)

New system `src/systems/bulletTime.js`, flag `bulletTime`:

- Hold CapsLock → `timeEffects.set('player:bullet-time', { scale: 0.35 })`; release/empty
  → `clear`. Min-wins composition with flyby focus (0.5), hit-stop (0.12) and pause (0) is
  automatic and already contract-tested.
- Meter: `state.massline2.bulletTime = { energy 0..1, active }` — drains in
  `BT_DRAIN_PER_S` (default 0.55/s), recharges at `BT_RECHARGE_PER_S` (0.18/s) only while
  inactive, engages only above `BT_MIN_ENERGY` (0.15) so it can't stutter.
- Deterministically inert: `state.timeScale` is written only through the timeEffects
  service, the sim never reads it, and the harness steps fixed dt (verified). Golden-safe
  by construction *and* flag-gated.
- Flyby focus remains the automatic assist; bullet time is the manual one. They compose
  (min wins). Auto micro-dilation near throw solutions is DEFERRED (principle 1 risk).
- HUD: micro-bar in the existing `.sf-bars` column. Event-driven audio sweeps pooled filters on
  engine/ambient/combat to 1100 Hz, pitches physical loops to 0.85x, and ducks music 4 dB;
  UI/comms filters and loop pitch stay crisp. Exit restores over 150 ms, mute stays inert.

## 6. Tumble states + morale (§3.4)

New system `src/systems/tumbleStates.js` (runs after `aiPorts`, before `weapons`), flag
`masslineTumble`:

- **Entry**: (a) a whip-released hostile ship whose imparted spin exceeds its RCS budget —
  measured against `angularAccel × inertia × authority.yaw`; (b) a `tether:whipImpact`
  victim of `solid`/`crushing` rating. Entry applies a real
  `queuePhysicsTorqueImpulse` so the spin is honest, plus `e.data.tumble = { until }`.
- **While tumbling**: the system overwrites the tick's physics control with zero
  force/torque (last-writer after aiPorts) and clears `intent.fire`; a new data-driven
  status `status_tumbling` (additive entry in `src/data/combatDefs.js`) blocks
  dash/tether/weapon action tags and flips the AI decision layer into its existing
  emergency handling.
- **Recovery is physical**: rapier `angularDamping` (the shipped RCS-stabilization model)
  decays the spin; the state ends when |angVel| < threshold, clamped to
  [`TUMBLE_MIN_S`=1.5, `TUMBLE_MAX_S`=6].
- **Players never tumble** (principle 2 / difficulty rule). Enforced in the entry check.
- **Morale**: a new branch in `pirateDisengage.moraleDecision` (flag-gated):
  a squad-mate tumbled in the last 8 s counts as a morale event — profit-motive crews
  flee; `moraleExempt` (bosses/aces/vendettas) still applies. A fled named ace already
  round-trips into `aceMemory` through the encounter receipt (`outcome:'escaped'`). Named aces
  also record additive `flungCount/lastFlung*` memory from `massline:tumbled` without forcing
  a boss flee or changing hostility.
- **Jackpot**: while tumbling, a `physics:impact` above the momentum threshold routes
  kinetic damage to the tumbler through the combat kernel (my system listens; combat.js
  untouched). Player is never a victim of this path.

## 7. Collision asymmetry (§3.5)

Verified baseline: NO system deals hull damage from physical contact today (physics
emits `physics:impact`; consumers are fragileCargo + audio/feel). So the player half of
the asymmetry ("no impact hull damage, ever") is the shipped baseline — the invariant is
now *documented* and all new impact-damage paths (whip reciprocal, tumble impact) are
written player-exempt by construction.

Additions (all in massline2 systems, flag `masslineImpactDamage`):
- Whipped SHIP payloads take a reciprocal fraction (`WHIP_RECOIL_FRACTION`=0.35) of the
  momentum damage their impact deals (being used as a club hurts) — listener beside the
  shipped `whipDamage` consumer, same kernel routing, `massline_whip` provenance.
- Tumbling ships take momentum damage on hard contact (§6).
- Player on hard impacts: presentation only — shield-flicker vfx cue + trauma, no hull.

## 8. Cloak & sensor stealth (§4.2)

New system `src/systems/cloak.js`, flag `cloak`:

- Module-activated: `mod_cloak_mk1/mk2` (data/modules.js, utility slot, mods carry
  `cloakBaseRadius`, `cloakDrainPerS`, `cloakRechargePerS`); fitted through the existing
  outfitting path (no new save shape — fittedModules already persists).
- Runtime `state.massline2.cloak = { active, energy, radius }` (+ a lazily-materialized
  `state.player.cloak` mirror for HUD/save round-trip without schema churn).
- **Dynamic detection radius**: `radius = base × (1 + thrustGrow + fireGrow + reelGrow +
  boostGrow)`, decaying toward base while coasting. Firing breaks cloak outright
  (`CLOAK_BREAK_ON_FIRE=true` dial). Coasting dark = smallest signature: drift becomes
  purposeful.
- **Honest AI gating at the single perception seam**: `aiPorts.entityContacts` skips the
  player contact when cloaked and outside `radius` (flag-gated edit; the tactical stack
  then genuinely cannot target what it never saw). `patrol:proximity`-driven customs scans
  gate on the same read. No scattered special cases; no cheating AI.
- Detection ring drawn with the existing target-arc world-radius template; energy as a
  `.sf-bars` micro-bar.
- The live V3 adapter applies cloak-only neutral assist scale `0.28` while genuinely coasting;
  translation input or explicit brake immediately restores normal authority.

## 9. Loot & terrain (§4.3–4.4)

- **Magnetism already ships** (`mining._updatePickups`: range 420, accel 520 — pickups
  only, wrecks untouched). The actual gap: ship kills drop only a salvage WRECK (a chore
  mid-fight). New listener (flag `lootShards`): on hostile ship kill, emit the existing
  `loot:drop` seam with a small shard pool (1–3 items scaled by ship class) — they
  magnetize with zero new collection code. Bulk salvage wrecks unchanged.
- **Terrain anchors** (flag `terrainAnchors`): listener on `encounter:telegraph` — if the
  bubble has < `ANCHOR_MIN`(2) large bodies within `ANCHOR_RADIUS`(600) of the anchor,
  spawn up to `ANCHOR_MAX`(3) big rocks (radius 26–40, immovable per the shipped asteroid
  physics). Overlapping encounters share the same generated anchors through encounter-owner ids;
  the last resolution schedules a 45 s aftermath cleanup, with a long TTL only as orphan insurance.
  Few and large — playground, not gravel. No spawnBudget consumption (it counts ships).

## 10. Tier 3

- **Jettison impulse** (flag `jettisonImpulse`): listener on the cargo jettison event —
  reaction impulse `ejectedMass × JETTISON_EJECT_SPEED / shipMass` forward, via
  `combatPhysics.applyImpulse`. Cargo ejects aft at the matching 60 wu/s with a two-second
  sim-time collection/magnet embargo, closing the recover-and-repeat propulsion exploit while
  keeping later recovery possible.
- **Bomb propulsion** (flag `bombPropulsion`): the researched `tech_impulse_ballistics` plus fitted
  `mod_charge_vector_rack` turns brake/reverse + throw into an armed aft drop. Detonation remains
  deliberate on R; surface-distance falloff lets every live hull ride the blast while closer
  placement retains real self-damage and pursuer damage.
- **Hitchhiking** (flag `hitchhiking`): neutral COM-to-COM latching remains honest Rapier pull.
  Core pockets now expose one deterministic passive Express Liner with a durable station itinerary,
  readable HITCHABLE label, embodied freight manifest, and live V3 NPC boost intent (246.5 speed
  envelope versus the starter's 195 combat cruise). No player velocity writes or enemy tether verb.

## 11. Flags, goldens, saves

- All flags live in `src/data/featureFlags.js` as a new `MASSLINE2_FLAGS` block +
  `massline2Flag(name)` reader (same mutable-module pattern; master `enabled` &&
  per-feature keys). Default `IS_BROWSER` — OFF in the node golden, ON live. Risky feel
  gambles default hard-false where noted.
- New systems register in `registry.js` SYSTEMS/UPDATE_ORDER but are NOT added to the
  sf-sim curated list — the primary golden guarantee; flags are the second belt.
  New runtime state lives under `state.massline2` (outside the snapshot whitelist and
  outside `serializeData`) except deliberate lazily-materialized `state.player.*` mirrors
  (schema doc derives from a fresh fixture, so no SAVE_SCHEMA churn; old saves default
  safely on read — no migration required this wave).
- Files edited that the golden DOES run: `weapons.js` only — every behavioral branch
  there is `massline2Flag`-gated.
- Onboarding: contextual one-shot hints via the shipped `_showHint` mechanism for assist-mode-true
  throw copy, cloak, bullet time, bomb propulsion, express hitching, self-sling, and jettison
  reaction mass. Keys materialize lazily; an express latch owns one tutorial voice and leaves the
  general throw lesson for a later ordinary latch. The authored first-hour BEATS rail is untouched.

## 12. Dial registry (initial values — all in one place per system)

| Dial | Default | Meaning |
|---|---|---|
| `SNAP_WINDOW_MS` | 90 | manual release forgiveness half-window |
| `assistForgiveness` | 1.6 | victim-radius multiplier in the solution tolerance |
| `TOL_MIN/MAX_DEG` | 0.5 / 12 | solution tolerance clamp |
| `slingBonusPerDecade` | 55 wu/s | self-sling exit bonus per mass decade over ship |
| `BT_SCALE` | 0.35 | bullet-time time scale |
| `BT_DRAIN/RECHARGE` | 0.55 / 0.18 per s | bullet-time meter rates |
| `TUMBLE_MIN/MAX_S` | 1.5 / 6 | tumble duration clamp |
| `TUMBLE_TORQUE_MULT` | 2.2 | applied spin vs victim RCS budget at entry |
| `WHIP_RECOIL_FRACTION` | 0.35 | reciprocal damage share to the thrown ship |
| `CLOAK_BASE_RADIUS` (mk1/mk2) | 320 / 210 | detection radius while dark |
| `CLOAK_DRAIN/RECHARGE` | 0.09 / 0.06 per s | cloak energy rates |
| `ANCHOR_MIN/MAX/RADIUS` | 2 / 3 / 600 | terrain anchor budget per bubble |
| `JETTISON_EJECT_SPEED` | 60 wu/s | reaction-mass exit speed |

## 13. Full implementation audit closeout (2026-07-12)

The follow-up audit treated this whole handoff as executable scope, including conditional Prompt F.
It corrected the following integration defects instead of merely checking that files existed:

- tether fire control now solves the live aim-true, per-mount projectile path; `arm`, `snap`, and
  `off` release modes are behaviorally distinct and use the correct time-to-solution sign;
- towable dynamic targets attach COM-to-COM, while hostile combat targets and immovable terrain keep
  their authored combat/surface anchors;
- tumbling blocks dash, tether, and weapon actions before capacitor spend; player immunity remains
  absolute; named aces retain additive fling memory without forced flee/hostility changes;
- loot shards require a hostile kill; terrain anchors share encounter ownership and clean up after
  the last owner resolves; jettison cargo cannot be magnetized for two sim seconds;
- cloak/bomb modules expose their relevant player-facing stats; physical bullet-time audio is warped
  while UI/comms stay crisp; Express Liners carry real freight instead of decorative route metadata;
- SG-02 attachment telemetry restores the gameplay-plane `y:0` required by its 3D point schema.

Fresh acceptance after the audit: `check:massline2` (20 sections), `check:massline:hitchhiking`,
`check:flight:v3`, `check:flight:clean` (five desktop/mobile clean runs), `check:assets:live`, the
tether gameplay check, and `check:sim:compare` (`deterministic:true`, `hashEqual:true`) are green.
The bespoke normal-route browser probe proved authored flight, Rapier/V3 readiness, KeyF latch, a
real physics handle, and held-F joint shortening on its first run, but did not complete the later
LMB/RMB/loot/cloak/jettison sequence: that run lost the moving fixture after reel release, and two
controlled reruns timed out in the probe's one-shot launch wait. The official clean-flight gate's
retrying route remained green; therefore the unreached probe stages are not recorded as live proof.

Repository-wide residuals are outside this handoff: strict `check:perf` is red while the active
Blender/export lane is present (rAF p95 49.9 ms, 136 >32 ms hitches, autosave slice 33.9 ms vs 32 ms),
and the broad `npm run check` advances through SG-02/05/06, combat, and save confidence before the
unrelated title occupied-save styling assertion. The historical `check:massline` aggregate still
stops at its final 47-A hostile-damage source assertion after all earlier children pass.
