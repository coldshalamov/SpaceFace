# PB-TAC-C — baitable sniper corridor + brawler mass commitment

Row: `build_map.md` #89 (SF-050 + SF-051).

## What landed

`src/ai/combatDoctrine.js`, `src/ai/maneuver.js`, `src/ai/fireDiscipline.js`,
`src/systems/aiFireIntent.js`, `src/systems/aiPorts.js`, `src/ai/contracts.js`:

- **SF-050 committed firing corridor** — at `outer_standoff → charge_cue` the ranged disengager
  solves a forecast bearing once (`corridorBearing`, lead at the shooter's real bolt speed) and
  publishes it as `aimCommit {bearing, capRad: 0.1}` + `faceAngle`. The snapshot suppresses
  `faceTarget` while the corridor is live, so the nose rides the telegraphed line through the
  wind-up instead of re-tracking the contact. `enter()` clears the bearing on every phase except
  `charge_cue`/`fire_window`, so a closing-interrupt retreat or a post-shot reset can never hold a
  stale line into the next cycle.
- **Bounded correction, not re-tracking** — `aiFireIntent.committedCorridorAim` anchors the true
  firing lead on the first tick the corridor is observed and clamps every later fresh solution to
  ±0.1 rad of that anchor. A lateral dodge moves the live bearing arbitrarily far while the
  release line stays within the band of the corridor the pilot was shown; an undodged target
  still takes the honest lead (anchor == fresh).
- **Mount reality gate** — a corridor only counts if an aim-following mount can bear it
  (`mountConeStatus`/`mountFollowsAimAngle` in fireDiscipline: fixed guns and continuous beams
  release along `rot + facing ± gimbalArc`; turret/homing/deploy mounts solve their own direction
  and cannot fly a corridor). Off-bore → hold with `committed_aim_off_bore` while
  `intent.aimAngle = corridor − mountFacing` slews the hull until a mount's cone covers the line.
- **Battery-speed truth** — `aiPorts.sensorSelf` now publishes `aimProjectileSpeed` (max projSpeed
  over aim-following mounts), and `corridorBearing` forecasts with it (340 WU/s nominal fallback).
  A 700-speed railgun telegraphs the line its volley actually flies — under the old flat nominal
  the released shot could sit outside the corridor's own ±0.1 rad band. `contracts.js
  normalizeSelf` whitelists the field so the frozen-frame path carries it too.
- **SF-051 mass-committed charge** — `engine_flare → commit` now stamps
  `record.flightPoint = committedChargePoint(...)`: the target's forecast position
  (tof = clamp(d/160, 0.2, 2)) pushed 420 WU past it along the run line. Commit drives
  `ManeuverKind.INTERCEPT` with `faceTarget: false` and `crossingLane: true` — the arrival brake
  (`approachSlowRadius → 0`, `closingLimited` bypassed) can never engage mid-run, so the hull
  blows through the corridor. A sidestep cannot re-plan the point; once the target is passed
  (closest-distance +32 WU, or >24 WU behind the velocity vector) or `BRAWLER_COMMIT_MAX_TICKS`
  hits, `beginEgress` replaces the run point with a real egress point and `breakaway` recovers.
- **Egress map fix (review F2)** — the `disabledNonlethalTarget` hatch's hand-rolled phase ternary
  (which mapped brawler → 'retreat', a phase `updateBrawler` never advances, and flyby →
  'breakaway', a phase `updateInterceptor` never advances) is replaced by `egressPhaseFor(record)`
  — the same mapping the pressure-break hatch already used. `isEgress` learned `regroup` and
  `broadside_shift` so a disabled-target egress keeps egress range instead of falling back to the
  faction standoff band.
- **faceAngle precedence** — `ManeuverPlanner` gives a doctrine-published `faceAngle` top priority
  over `faceTarget`/`desiredUnit`; reflex `dropAim` still vetoes it (hull integrity beats
  commitment — same exception class as `reflex.brake` under `crossingLane`, now documented).

## Tests

- `test/combat-doctrines.test.mjs` — corridor anchors at cue, dodge leaves it stale, faceAngle
  pinned, window keeps it, reset clears it and post-window live tracking resumes; corridor honors
  the 700-speed battery hint and diverges from the 340 nominal; brawler commit is INTERCEPT +
  fixed flightPoint, sidestep can't move it, overshoot ends in `breakaway` +
  `brawler_commit_complete` with a replaced egress point.
- `test/ai-fire-lead-model.test.mjs` — corridor anchors at cue; dodge holds release inside ±cap
  while the true lead diverges ~0.5 rad; steady target still takes the real lead; off-bore
  corridor holds with `committed_aim_off_bore`; mid-window authority revocation still wins;
  corridor drop clears `combat.aimCommit`.
- `test/combat-ai-intentional-movement.test.mjs` — executed-path proofs through
  `ManeuverPlanner.plan`: cue/window `targetHeading` rides the corridor while the dodged contact's
  live bearing diverges >0.2 rad; brawler commit heading rides the fixed run point, ignores the
  sidestep bearing, `brake === false`, forward drive maintained under `crossingLane`.
- `test/inference-5x-brawler-doctrine.test.mjs` — stale `orbit`/`faceTarget` expectations re-pinned
  to the committed-run contract (commit age semantics honestly labeled; pass-geometry egress is
  proven post-min-age in the doctrine suite).

Adjacent batteries green: doctrine/authority/discipline 74/74, perception/index/decision/
stability 36/36.

## Deferred boundaries (logged, not blockers)

- Review residual: mixed batteries (fast self-solving turret + slower fixed gun) can still
  diverge corridor-vs-anchor within the ±0.1 rad cap — the corridor telegraphs the aim-following
  speed, which is the truer line for a committed corridor.
- `intent.aimAngle` persists ~1s after corridor drop on non-fire ticks (pre-existing pattern,
  cosmetic; SG06-driven combat hulls steer from the maneuver request regardless).
- `faceAngle` survives enemy-mind/choreography maneuver spreads — deliberate: the doctrine record
  owns aim authority and self-clears on its own phase edges.
