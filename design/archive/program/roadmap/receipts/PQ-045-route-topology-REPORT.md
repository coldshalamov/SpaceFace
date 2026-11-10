# PQ-045.route-topology — Give each Ceres pocket its own route topology

**State:** done
**Paths touched:** `src/data/sectorActivityPockets.js`, `test/ceres-active-pockets.test.mjs`
**Checks:** `npm run check:baseline` PASS (11/11), `npm run check:pq020:ceres-topology` PASS

## The defect

All eight Ceres actors were built from one shared pair of cardinal marks, `MARK_DISTANCE_WU =
[102, 116]`, placed on the +/-x and +/-z axes. Measured from the authored data:

| routes | sweep at anchor | span | classed as |
|---|---|---|---|
| refinery hauler, refinery tender, ambush hauler, ambush escort, cathedral salvor, cathedral patrol | 180.000 deg | 218.000 WU | `180deg/225wu` |
| seam miner, seam surveyor | 90.000 deg | 154.467 WU | `90deg/150wu` |

Three of the four pockets — Refinery, Ambush Run, Cathedral Grave — were therefore *geometrically
identical to each other*, and the two actors inside every pocket were identical as well. Four
different fictions read as the same back-and-forth. Ceres could not serve as the propagation
template for other sectors while failing the no-two-places-share-a-topology rule against itself.

## What changed

Route geometry only. Sixteen mark offsets were re-aimed. Nothing else about the cast moved:
actor counts, job kinds, `durationS`, spawn offsets, mark ids, mark order, `targetRef` values,
object slots, and collision anchors are all byte-identical to what landed before this unit.

### Why sweep and span are the design levers

A two-mark route has exactly two geometric properties a player can perceive: the angle the two marks
subtend at the pocket anchor (**sweep** — the shape the traffic traces) and the distance between them
(**span**). Span is also speed, because `npcJobsRuntime` derives `speed = span / durationS` and the
durations are fixed by this unit's own rules. Route mark count could not be used as a lever:
`src/systems/traffic.js:234` and three checks in `npcJobsRuntime` hard-require exactly two marks, and
`traffic.js` belongs to the concurrently-running `PQ-045.npc-identity`.

Each pocket was given its own sweep/span band, chosen from what that pocket's work actually is:

| pocket | topology | band |
|---|---|---|
| Working Seam | tight wedge | close, repetitive extraction beside one ore face |
| Cathedral Grave | quarter arc | working and patrolling *around* a grave, not through it |
| Refinery Pocket | wide oblique | long call-outs across a yard between hub and client |
| Ambush Run | transit lane | the Throughline is a lane; you cross it end to end |

### Result

| route | marks | sweep | span | speed (was) | class |
|---|---|---|---|---|---|
| `ceres_seam_extraction_loop` | (-29,-117) (-116,-29) | 62.043 | 123.746 | 5.156 (6.436) | `60deg/125wu` |
| `ceres_seam_survey_sweep` | (123,4) (34,117) | 71.934 | 143.840 | 5.532 (5.941) | `75deg/150wu` |
| `ceres_cathedral_salvage_loop` | (-114,39) (58,101) | 100.981 | 182.833 | 6.094 (7.267) | `105deg/175wu` |
| `ceres_cathedral_patrol_perimeter` | (57,-108) (-120,-21) | 107.898 | 197.226 | 7.044 (7.786) | `105deg/200wu` |
| `ceres_refinery_freight_loop` | (112,-36) (-49,93) | 135.603 | 206.306 | 8.596 (9.083) | `135deg/200wu` |
| `ceres_refinery_tender_service` | (-66,85) (10,-119) | 146.975 | 217.697 | 7.775 (7.786) | `150deg/225wu` |
| `ceres_ambush_escort_crossing` | (-109,34) (100,-56) | 168.075 | 227.554 | 11.378 (10.900) | `165deg/225wu` |
| `ceres_ambush_loaded_crossing` | (-112,48) (112,-48) | 180.000 | 243.705 | 11.077 (9.909) | `180deg/250wu` |

Eight distinct route classes; four distinct pocket signatures. Every mark remains inside the
`moving` band (radii 105.12–123.75 WU, all `95 < d <= 125`). Derived speeds span 5.156–11.378 WU/s
against a previous 5.941–10.900, so no actor was slowed or sped to something the existing motion
tests do not already cover.

### Bearings are derived, not chosen

Nothing here was picked to be merely different, and nothing was randomised:

- Marks that are destinations sit on the true bearing of the object they name — `refinery_cargo_approach`
  is 0.10 deg off the cargo pod, `cathedral_salvor_shard` 0.04 deg off the grave shard.
- The Ambush lane runs the axis the two authored collision anchors already define, `(48,64) -> (150,20)`
  = -23.34 deg; the loaded crossing runs -23.20 deg. It is the only route still permitted to run
  straight through its own anchor, because a lane is the one fiction where that is correct.
- Marks naming an object the runtime physically *drives to* are deliberately held around from it, so
  live-target tracking and authored-waypoint fallback stay causally distinguishable. This is the
  convention `PQ-045.tender-client-materialization` established for the disabled hull; this unit
  preserved that separation (0.59 rad, up from 0.54) and applied the same rule to the ore clast.

## Distinctness is enforced, not described

The unit's rule was that distinctness be enforced in the test, not in prose. It is enforced in two
independent places, and neither is a comment:

1. **Module load** — `CERES_ROUTE_TOPOLOGY` in `sectorActivityPockets.js` measures every route from
   its own marks and throws if any two routes, or any two pockets, share a class.
2. **`test/ceres-active-pockets.test.mjs`** — two new tests re-derive sweep and span from the raw
   marks with bearing/distance maths written out independently of the module, assert they agree with
   the shipped values, assert route- and pocket-level distinctness, pin the authored class table, and
   assert every route sits clear of a class boundary.

Classes are deliberately **coarse** — sweep bucketed to 15 deg, span to 25 WU — because a distinctness
rule that compares exact floats is satisfied by noise: two routes 0.4 deg apart would "differ" while
reading identically in play. The authored values sit at least 3.48 deg and 4.67 WU clear of a bucket
edge, and the test asserts that margin so a future retune cannot drift onto a boundary and start
reporting a difference no player could see.

### Negative controls (run, not assumed)

The old cardinal marks were restored and both mechanisms were confirmed to reject them:

- **Control A** — old marks, guards live: `npm run check:pq020:ceres-topology` exits 1 with
  `Ceres routes share a topology class: ...=180deg/225wu, ...=180deg/225wu, ...=90deg/150wu, ...`
- **Control B** — old marks, module guards bypassed so the test alone is under examination: both new
  tests fail, on `every Ceres route needs its own topology` and on the object-bearing derivation.

The file was restored from a saved copy and re-verified after both controls.

## Verification

- `npm run check:baseline` — PASS, 11/11 links green (60.2 s wall).
- `npm run check:pq020:ceres-topology` — PASS.
- `node --test test/ceres-*.test.mjs` — 216/216 pass across all eleven Ceres suites, including the
  Rapier physics closure tests, the faction tender chain, escort formation, and the five-minute
  acceptance suite. Run as a collateral check; not required by this unit.

## What this does NOT prove

- **Neither required check executes `test/ceres-active-pockets.test.mjs`.** `check:baseline` runs
  eleven links (`ui-screen-imports`, `pq020-ceres-topology`, `save-schema`, `flight-v3`,
  `m1-tether-mass`, `sim-v3-compare`, `render-package-plan`, `sim-compare`, `sim-v3`, `sim`,
  `massline`) and none of them reaches that file. This is exactly why the distinctness invariant is
  *also* at module load: `check:pq020:ceres-topology` imports `world`, which imports
  `sectorActivityPockets`, so the required gate does enforce it. That import path was confirmed
  empirically with a throw probe before the invariant was written. The test still has to be run
  directly to be enforced, and was.
- **No headed or visual evidence.** Every claim here is headless and geometric. That these four
  topologies actually *read* as four different fictions on screen is unproven — that is the
  five-minute gate (`PQ-045.five-minute-h1`) and the human verdict (`PQ-045.human-review`), and no
  agent may self-grant it.
- **No claim about other sectors.** This makes Ceres satisfy the rule against itself, which was the
  stated precondition for using it as a propagation template. Propagation itself was not attempted.
- **Speed feel is bounded, not tuned.** The test asserts derived speeds stay within 4–13 WU/s. That
  is a guard against a stalled or teleporting actor, not evidence that any particular actor now moves
  at the right pace.

## Deliberately left out

- **No third mark.** A route with three or more marks would give far more topology to work with, but
  `traffic.js:234` returns null for anything that is not exactly two, and `traffic.js` is owned by the
  concurrently-running `PQ-045.npc-identity`. Out of scope for a geometry unit.
- **No changes to object slots, collision anchors, or spawn offsets.** The disabled hull at `(-65,-65)`
  is landed work from the previous unit with three pinned constraints; the collision anchors have
  exact global positions and an exact entity census asserted next door. Marks only.
- **`ceres_cinder_service_hauler` untouched.** It is a reserved slot with `jobKind: null` owned by
  `traffic`, not a routed pocket actor, and has no route topology to give.
- **The stale `0.54 rad` figure in the disabled-hull note was corrected, not deleted.** Re-aiming the
  tender's client mark moved that measured separation to 0.59 rad. Leaving a pinned-constraint comment
  describing geometry that no longer exists is the same class of defect this unit was opened to fix.

## One cross-file constraint found the hard way

Putting the miner's `seam_miner_ore_face` mark on the ore clast's true bearing — the obvious reading
of "derive it from the fiction" — broke `ceres-activity-runtime-lifecycle.test.mjs:2297`, which flies
an approach 200 WU west of the live clast and requires the authored-waypoint aim to differ from the
live-target aim by more than 0.25 rad. No point on the clast's bearing can satisfy that; the entire
`moving` band tops out near 0.15 rad. The fixture is right and the instinct was wrong: an authored
fallback that points the same way as the live target makes the two indistinguishable, which is the
defect the earlier PQ-045 leaves existed to remove. The mark is now held ~38 deg around from the
rock, and that cross-file constraint is re-asserted inside `ceres-active-pockets.test.mjs` so a
future retune fails in the file that causes it rather than in one this unit may not edit.
