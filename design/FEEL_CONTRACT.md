<!-- LIFETIME: STABLE -->
# SpaceFace — The Feel Contract

**Status: ACCEPTANCE AUTHORITY for every packet in the "box of dangerous toys" program
(`CANONICAL_BUILD_MAP.md` §13C, `PQ-137` … `PQ-145`).** Written 2026-09-03 from a code audit of the
live default route, after the owner's verdict that the combat and flight "just suck" and that agents
"keep expanding the turd instead of fixing the turd."

Product intent lives in [`VISION.md`](./VISION.md). This file exists because intent written as prose
gets taken literally: "the ship follows the path" shipped as a tram at walking speed and passed its
own test, because the test measured cross-track and never speed. **Every bar below is written in
units an agent cannot tune away** — screen depths, seconds, hull lengths, fraction of hull lost,
fraction of speed kept — and every bar fails on the live route at the date of writing unless marked
otherwise. A packet that cannot point at the bar it moved is content, not convergence.

---

## A. What actually made it feel bad (the audit)

The owner's guess was right: *"it just has a bad configuration or something, or there hasn't been
enough attention on the guts of the physics."* Seven rules, each added by a different agent for a
locally sane reason, stack into "nothing I do sticks." None of them is a missing feature.

| # | Rule in the live code | What it did to the fantasy | Vision sentence it broke | Status |
|---|---|---|---|---|
| A1 | Assisted-mode governor braked at 24–28 % of reverse authority whenever the throttle was held above `combatSpeed` (`src/core/flight/propulsionKernel.js` `applySpeedGovernor`). Pressing **forward** after a slingshot slowed the ship. | Earned speed spent within seconds; the pilot's own throttle was the anchor. | "Thrusters have a cap, physics-earned speed does not get eaten by the brakes." | **FIXED 2026-09-03** — floor is coast (0), never reverse. |
| A2 | Hands-off "neutral counter-thrust" at 44 % of authority with a 2.35 s stop horizon applied at **any** speed (`reactionAssistAcceleration`). Letting go after a sling braked harder than holding forward. | No way to keep earned speed in the default mode except holding boost. | Same. | **FIXED 2026-09-03** — assist blends to zero across 15 WU/s above the cap; below the cap the nimble settle is unchanged; the pilot brake keeps full authority. |
| A3 | The "physics-earned" exemption only ever applied to a rope release, lasted **1.0 s** (`SLINGSHOT_STATE_S`), and still decayed with a 6 s time constant. A shove, a well fling, a rock bounce, a mine self-launch: never tagged, braked at once. | Only one verb could earn speed, and only for a second. | "If I swing well, slingshot well, fly well, I EARN speed and I KEEP it." | **Superseded** by A1/A2 (the tag is now telemetry). |
| A4 | The physics layer truncated every NPC's velocity to `1.15 × maxSpeed` each tick (`sg02DynamicBodyOwner._clampSpeed`) — impulses, throws, flings and contacts included. A pirate at cruise that took a concussion hit had the hit deleted one tick later. | Light ships could not become projectiles. | "He becomes a projectile." "Light ships are ammunition." | **FIXED 2026-09-03** — the cap now bounds only thrust-added speed; given momentum survives. Side effect, by design: a gravimetric player hull (the one drive family with a finite `solverSpeedLimit`) now also keeps externally given momentum above that cap; its own drive still cannot exceed it. |
| A5 | Terrain and structure contact was defined as never taking the helm (`impulseKernel.collisionAllowsHelmLoss`), and contact yaw is stripped from craft so "the nose stays on the AI heading." A ship thrown into a rock kept flying its plan. | Slamming someone into an asteroid produced nothing to watch. | "Slam them into asteroids." "Discover an asteroid at several hundred meters per second." | **FIXED 2026-09-03** — a hard slam (ΔV ≥ 18 WU/s) tumbles regardless of provenance; scrapes stay helm-neutral. |
| A6 | Per-contact momentum exchange is bounded to `mass × 40 WU/s` before the consequence kernel sees it (`_captureContactImpacts`), so a 150 WU/s slam registers as a 40 WU/s event: ~25 % of a light hull. | Terrain is a scratch, not a kill. | Same. | **OPEN** → `PQ-137.06`. Damage must come from pre-solve closing speed; the solver bound protects the solver, not the story. |
| A7 | Thrust authority (38–48 WU/s²) against fighting speed (measured 112–133, governed 195) against visible depth (~100–125 WU): the ship crosses the whole screen in 0.6–1.0 s and needs 3–5 s to reach cruise, 6–10 s to reverse, and a **750–2,000 WU** turn radius at cruise (7–20 screens). | "Fast but not agile" (Kimi's phrase). Neither PQ-135.00 nor .01 touched this ratio. It is also *why* draw-to-fly trams: no controller can fly a hand-drawn curve fast in a ship that needs 15 screens to turn. | "Turn NOW when I twitch." "A controllable mass, not a cursor." | **OPEN** → `PQ-137.03`. |
| A8 | Weapon impulse: starter gun **0.5** momentum (0.03 WU/s on a light hull); the one shove weapon 420 (≈ 26 WU/s, 12 % of cruise) is tech-gated in adventure and the Crucible flies "the loadout you launched with." NPCs get 0.5 s without counter-thrust after that one weapon and **0 s** after every other. Guns never cause helm loss. | Shoving "barely does anything" because it barely does anything: the default kit has no shove at all. | "Shoot weapons where it'd blast enemies away and into things." | **OPEN** → `PQ-137.04`, `.05`. |
| A9 | The Massline is a spring (K = 170, damping ζ 0.9). Computed: a light hull swinging at 200 WU/s on a 100 WU line needs ~7,000 units of tension → ~41 WU of stretch (41 % of the line), at the overload edge. | Swings read as bungee, fast swings snap. | "White-hot rope brightest on screen." "Swing around a huge asteroid and let go flying." | **OPEN** (computed, unmeasured) → `PQ-137.07`. |
| A10 | The draw-to-fly follower's corner speed is `sqrt(a_lateral × R_stroke)` with the ship's real strafe authority (19 WU/s²), so a 30 WU hand radius forces ~24 WU/s. It tracks the ink; it does not reinterpret it. | The tram. PQ-135.00 fixed jitter-as-hairpin; the physics floor remained. | "It flies like a skilled pilot would fly my sketch — cutting where it should." | **OPEN** → `PQ-137.08` (depends on A7). |
| A11 | Physical impacts get **zero** hitstop and zero camera trauma (`feel.js` subscribes to damage/kill/fire, never to collisions); collision audio is one sample with a clamped gain and no mass term; the Massline release is hard-coded `hsDur: 0`. | Impacts don't answer; a scout and a freighter make the same noise; the signature verb never snaps. | "Impacts should answer instantly." "Sound tells weight." "A Massline release should feel like something snapped loose." | **OPEN** → `PQ-139`. |
| A12 | Three world-reaction events have **zero listeners**: `aftermathWreck:spawned` / `survivorPod:ejected` (the patrol never has to choose), `freight:cargoSpilled` (NPCs never notice spilled cargo), and nothing in traffic reacts to `combat:damage` or `law:incidentOpened` (civilians fly through firefights). | The world does not react to violence. | "Maybe the patrol that was protecting it has to choose." "The civilian hauler panics." | **OPEN** → `PQ-138`. |
| A13 | The owner reports the player's own hull being "knocked around all the time" by bumps (their words, 2026-09-03: "buggy as shit and it made it impossible to fly"). Today the player never tumbles and craft contact yaw is stripped, but contact may still change the player's velocity by up to 40 WU/s per tick, and no instrument measures how often. | Flying near anything feels like being shoved by a ghost. | "Turn NOW when I twitch." "A controllable mass, not a cursor." | **OPEN** → `PQ-137.11`; bar B13. |

**The pattern.** PQ-135.00's own done-when admits its tracking test never measured speed. PQ-135.01's
done-when has no numbers at all. `test/flightV3.spec.mjs` §12c asserted *"overspeed under held
throttle should decay toward the cap"* as correct, and `test/travel-drive.test.mjs` asserted *"the
UNBOOSTED overspeed brake survives the fix"* — the anti-vision behaviour was pinned green, so any
agent who fixed it hit red and reverted. A test that pins behaviour the vision forbids is a defect,
not a constraint. Rewrite it with the vision's sentence in the assertion message.

## B. The bars

Measure at the shipping chase camera, on the default route (`production` profile, `assisted`
flight, the starter hull unless a bar names another). "Screen depth" = the visible chase-camera
depth, ~100–125 WU. "Cruise" = the hull's governed `combatSpeed`. Deterministic scenarios go in the
Motion Lab (`src/testing/lab/`, PQ-135.02) or `tools/agentic/scenarios.json`; each bar names one.

| Bar | Player-unit statement | Live value at writing | Scenario | Status |
|---|---|---|---|---|
| **B1 Earned speed is kept** | After leaving the cap at 2× cruise by ANY means (rope release, shove, well fling, bounce), speed 10 s later is ≥ 99 % of the exit speed with hands off, and ≥ 99 % with forward held. Only the brake spends it. | Hands-off: braked to cruise in ~8 s. Forward held: braked at ~6 WU/s². | `feel.earned_speed_kept` (kernel: `test/flightV3.spec.mjs` §12c) | **MET** (kernel) 2026-09-03; route scenario still to add |
| **B2 Nimble regime** | From rest to cruise ≤ 1.5 s. Full 180° velocity reversal ≤ 3.0 s. Turn radius at cruise ≤ 1 screen depth. | 3–5 s / 6–10 s / 7–20 screens | `feel.reversal_course` (Motion Lab M4/M6) | OPEN `PQ-137.03` |
| **B3 The fight stays on screen** | At cruise the hull needs ≥ 1.2 s to cross the visible depth. Above the cap the camera opens so that a 2× cruise exit still shows ≥ 2 s of travel. | 0.6–1.0 s; camera opens only to 1.55× at 3× hull max | `feel.screen_crossing` | OPEN `PQ-137.03` |
| **B4 Shove magnitude** | The dedicated shove weapon changes a light hostile's velocity by ≥ 30 % of its cruise per hit. The **starter** gun changes it by ≥ 5 % per hit. A light hostile already at cruise gets **faster** when shoved along its motion. | 12 % / 0.03 % / clamped to 1.15× | `feel.shove_magnitude` | Clamp **MET** 2026-09-03; magnitudes OPEN `PQ-137.05` |
| **B5 Shove displacement** | 2 s after a shove-weapon hit, a light hostile is ≥ 1 screen depth off the line it was flying and has not fired. | ~1 hull length; fires after 0.5 s | `feel.shove_displacement` | OPEN `PQ-137.04` |
| **B6 Terrain is lethal** | A light hostile meeting rock at ≥ 50 % of cruise loses ≥ 60 % of hull and its helm; at ≥ 75 % of cruise it dies. A heavy at the same speed loses ≤ 15 % and keeps its helm. | ≤ 25 %, helm kept | `feel.terrain_slam` | Helm **MET** 2026-09-03; damage OPEN `PQ-137.06` |
| **B7 The rope is a rope** | Swinging at 1.5× cruise on a 100 WU line around a heavy anchor stretches the line < 10 % and does not break; releasing at the tangent keeps ≥ 95 % of tangential speed 5 s later. | ~41 % stretch (computed) / was braked after 1 s | `feel.rope_swing_release` | Release **MET** via B1; stiffness OPEN `PQ-137.07` |
| **B8 Draw-to-fly rips** | Mean speed along any hand-drawn stroke ≥ 70 % of cruise; the slowest point ≥ 35 % of cruise; the hull may leave the ink by up to 0.35× its own turn radius to cut a corner; ordered coverage ≥ 90 %. **Speed is the pass criterion; track is the constraint.** | Corner floor 14 WU/s (~1/8 of cruise); tracks the ink | `feel.stroke_speed` (extend `test/auto-target-path*.test.mjs`) | OPEN `PQ-137.08` |
| **B9 Impacts answer** | Every collision with ΔV ≥ 8 WU/s produces hitstop and camera trauma scaled by exchanged momentum. Collision audio differs by ≥ one octave of pitch and ≥ 12 dB between a scout kissing a rock and a freighter broadsiding a station. A Massline release has a time-domain snap. | None / one sample, clamped gain / `hsDur: 0` | `feel.impact_feedback` (receipt-level) | OPEN `PQ-139` |
| **B10 The world reacts** | Within 10 s of a kill in a patrol's sight, the patrol makes a visible stay-with-wreck / chase choice. Spilled cargo attracts an NPC within 30 s. Civilians within 300 WU of gunfire change course within 3 s. | Never / never / never (zero listeners) | `world.reaction_trio` | OPEN `PQ-138` |
| **B11 Hitstun law is universal** | Helm-loss duration is one function of (ΔV ÷ cruise) and (attacker mass ÷ victim mass) for guns, throws, flings and collisions alike; lights at ≥ 30 % ΔV lose the helm ≥ 1 s; heavies at gun-scale ΔV never do. NPCs recover with real thruster torque, never a hidden gyro. | Massline-only tumble; 0.5 s beat for one weapon | `feel.hitstun_curve` | OPEN `PQ-137.04` |
| **B12 The 60-second proof** | At the reference site, the VISION.md sequence (op working → hauler leaves → pirates intercept → shove spins one → rope-swing-release makes a projectile → collateral → cargo spills → hauler flees → patrol arrives → grab pod → run WANTED) occurs in a deterministic scenario with ≥ 9 of the 11 beats, and in a headed capture at the shipping camera. | Not attempted | `proof.sixty_seconds` | OPEN `PQ-141` — the program's acceptance gate |
| **B13 The player is never knocked around** | In ten minutes of ordinary flight (no rope, no fields, no deliberate ram), contact changes the player's velocity ≤ 2 times per minute and never by more than 10 % of cruise in one event, never changes the player's heading, and never produces visible jitter; a deliberate big event (a slam the player chose, a well the player flew into) may, and it must be legible. | Unmeasured; the owner reports constant knocking | `feel.knock_budget` | OPEN `PQ-137.11` |

## C. Experiment bands (candidate numbers, never law)

Two outside designers were asked the same questions with the live numbers (Gemini 3.8 Flash via
`agy`, Kimi K3 via `opencode`, 2026-09-03; transcripts in the session scratchpad). Where they agree
with the audit, the band is worth trying first. A leaf promotes a number only with Motion Lab
before/after evidence.

| Topic | Band | Source agreement | Grade |
|---|---|---|---|
| Fighting speed vs thrust | Lower the governed cruise toward the *measured* one (85–150 WU/s) and raise main accel to ~105–120 WU/s², strafe 75–80, reverse ~90; reversal 1.2–3 s. Get the rest of the agility from **lateral authority and camera zoom**, not cursor-snappy accel. | Both | Strong. Kimi's caution — keep a 1–3 s intent-to-velocity lag or "drift when I choose to" stops meaning anything — is the right guard against over-correcting. |
| Velocity-vectoring assist | Below the cap, a lateral force rotates the velocity vector toward the nose (~1.6 rad/s at low speed → 0.9 at cap, **zero above cap**). Turn radius at 120 WU/s ≈ 0.85 screen. | Kimi | Strong; it is the mechanism that makes "turn NOW" and "keep earned speed" coexist. Try before touching yaw. |
| Auto-brake at the cap | Full below, zero above, smoothstep over ~15 WU/s (Gemini) or a 0.95–1.10× hysteresis band with slew-limited authority (Kimi). Pilot brake always full. | Both | **Adopted** (smoothstep 15 WU/s, 2026-09-03). Add hysteresis only if oscillation is measured. |
| Camera with speed | Open linearly above the cap (+0.45 %/WU/s, max ~3× at ~550) or `depth = 115 + 0.85·(v − cap)` capped ~320 WU. | Both | Strong; the current 1.55× ceiling is the wrong order of magnitude for "exceptional speed opens the camera." |
| Draw-to-fly | Track a **pilot's reinterpretation**: fit a curvature-clamped centerline (`r_min ≈ 1.3 × r_turn(v)`), solve the speed profile backward along the path, corridor half-width `≈ 0.35 × r_turn(v)`, leave the ink only when the ink demands `< 0.8 × r_turn` or an obstacle intrudes; rejoin tangentially. | Both | Strong, and it depends on B2 — no follower can rip through a curve in a ship that cannot turn. |
| Hitstun law | `T = clamp(5 · k · mF, 0, 3.5)` with `k = ΔV/cruise`, `mF = clamp(√(m_attacker/m_victim), 0.5, 2)`, no-stun floor `k < 0.03` (Kimi); or `T = 2.2·(k − 0.12)^1.3` capped 3 s (Gemini). Entry spin ∝ k. | Both (shape agrees) | Strong. **Do not** scale knockback with victim HP % — it would reintroduce the HP grind by the back door (Kimi's refusal; adopt it). |
| Weapon force table | Starter ≥ 5 % of light cruise per hit; rail ~10 %; concussion 30 % (crosses the tumble threshold alone); radial mine 45 % at centre; Massline fling 130–220 %. | Both (Gemini's table is ~2–3× hotter) | Start at Kimi's, escalate with evidence. |
| Terrain slam law | Quadratic in closing speed above a crumple threshold (~30 WU/s), inverse in mass; a light dies at ~120–150 WU/s closing, a medium takes 35–60 % at 150–180, a heavy ≤ 12 % at 150. Compute from **pre-solve closing velocity**; keep the solver bound as a rate limit, never as the damage input. | Both | Strong; matches A6's fix. |
| Chains | Tethered pairs share helm loss and inertia; a "primed" ship detonates on slam and primes what it knocks past the stun threshold for ~0.8 s; wells converge ships to 30–60 WU/s relative and prime on grind. | Both | Good shape for `PQ-137.09`; numbers untested. |
| NPC recovery | No cheating gyros or transform-level anti-spin; recover with physical thruster torque over 1.5–3 s. | Both | **Rule.** |

## D. Process rules for this program

1. **No packet closes without numbers.** Before/after values for the bar it claims, from a
   deterministic scenario, plus one normal-speed capture at the shipping camera for anything
   player-felt. "It follows the path" is not a number.
2. **A test that pins anti-vision behaviour is a defect.** Rewrite the assertion with the
   VISION.md sentence in its message. Re-freeze a golden only with the causal diff recorded
   (`docs/COMMON_BUGS.md` §8); never to pass.
3. **Never add drag.** Space has no molasses. Control comes from thrust authority, assist that lets
   go above the cap, and camera; never from `v *= 0.98`.
4. **Never clamp given momentum.** A speed cap bounds a body's own drive. Shoves, throws, flings and
   contacts survive every cap (`_clampSpeed` is the reference implementation).
5. **NPCs obey the same physics as the player.** No hidden gyros, no transform writes, no instant
   counter-thrust after a hit. They recover with the thrusters they have.
6. **Feel is measured, then felt.** The Motion Lab (PQ-135.02) is the instrument; add the missing
   scenarios in Part B to it before tuning, not after.
7. **The gameplay camera is the only camera.** A number that is only visible zoomed in does not
   exist (`docs/AGENT_LESSONS.md`).
8. **Make existing features collide before adding one.** Part A's A12 is three missing listeners,
   not three missing systems.
9. **Crucible first.** Combat and flight feel converge in the Crucible bench (bounded, seeded, known
   loadout) and adventure inherits the numbers. Feel work that has not passed the bench is out of order.
10. **Everything is made by agents.** Voice is directed synthetic voice, art is Blender and imagegen through
    the generated-media rules, tuning is the Fun Convergence Loop; no step assumes a recorded actor or a
    human tuner. The owner's weekly 45-minute play is the only human step (`design/program/FUN_CONVERGENCE_LOOP.md`).
11. **Fixed seeds or it did not happen.** Every feel claim is a deterministic scenario with a seed and a tape;
    randomness in a bench once stalled development because nothing could be reproduced.

## E. Tests rewritten on 2026-09-03 and goldens to watch

- `test/flightV3.spec.mjs` §12c/§12d — now assert coast above the cap (hands-off, forward held, tag
  or no tag) and full pilot-brake authority; the below-cap settle is asserted unchanged.
- `test/travel-drive.test.mjs` — RC-4's gate test and "the UNBOOSTED overspeed brake survives" now
  assert the unconditional coast floor; the frozen kernel fixture
  (`test/fixtures/travel-drive-kernel-baseline.json`) was re-frozen for the overspeed cases only,
  with the changed case names recorded in the commit.
- `test/weapon-impulse-consequence.test.mjs` — structure/terrain slams: hard slams tumble
  (provenance-blind), scrapes stay helm-neutral (provenance-blind); the "freshly shot hull grazes
  terrain" regression is kept as a scrape.
- 47-A goldens: the legacy envelope stayed bit-identical; the V3 envelope moved by exactly four
  player motion fields (the earned-speed rule after the tape's one boost) and was re-recorded with
  the causal note per `docs/COMMON_BUGS.md` §10d. Future leaves: a moved hash needs the §8/§10d
  procedure and a causal record, never a repin.
