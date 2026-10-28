<!-- LIFETIME: ACTIVE_RECEIPT -->
# PQ-137.10 — the bars are measured on the route, and the route is in the gate

```text
DONE  PQ-137.10 — every feel bar the bench can reach now has a real-path scenario that prints its number, and those scenarios run in the smoke gate so a feel regression fails a check instead of a playtest.
WHAT I FOUND     Nine real-path scenarios existed (earlier lanes built them, bar by bar) but none of them ran in any gate, the contract cited a scenario name that did not exist for the shove-displacement bar, and the agentic scenario registry did not know any of them.
WHAT I CHANGED   One command runs every scenario's test; the smoke tier calls it; the contract's B5 row cites the scenario that actually measures displacement; the registry lists all thirteen feel and world-reaction scenarios with the bar each prints.
WHAT YOU WILL FEEL   Nothing changes in play. What changes is that the numbers behind "it turns inside the screen", "the shove throws it", "the rope holds", "rocks hurt", "my ship is not knocked around" are checked every time the smoke gate runs.
THE NUMBERS      scenarios with a printing test | 9 of 9 (B1, B2, B3, B4/B5, B6, B7, B8, B11, B13) · check:feel:scenarios | 34 tests, 34 pass, ~2 min · smoke tier | includes feel-scenarios
THE FRAMES       none — this unit has no player-felt change.
NEXT             PQ-137.11 the player is never knocked around
```

## What runs now

`npm run check:feel:scenarios` (in `check:all:smoke` as `feel-scenarios`):

| bar | scenario | test |
|---|---|---|
| B1 earned speed is kept | `feel.earned_speed_kept`, kernel guard with a negative control | `test/feel-regression.test.mjs` |
| B2 nimble regime, B3 the fight stays on screen | `feel.reversal_course`, `feel.screen_crossing` | `test/fun-bench-flight-scenarios.test.mjs` |
| B4 shove magnitude, B5 shove displacement | `feel.shove_magnitude` (both clauses) | `test/hitstun-curve.test.mjs` (shove bars) |
| B6 terrain is lethal | `feel.terrain_slam` | `test/terrain-slam.test.mjs` |
| B7 the rope is a rope | `feel.rope_swing_release` | `test/rope-swing-release.test.mjs` |
| B8 draw-to-fly rips | `feel.stroke_speed` | `test/draw-to-fly-stroke-speed.test.mjs` |
| B9 impacts answer (receipt level) | `feel.impact_feedback` | `test/feel-collision-impact.test.mjs` |
| B11 one hitstun law | `feel.hitstun_curve` | `test/hitstun-curve.test.mjs` |
| B13 knock budget | `feel.knock_budget`, `feel.knock_budget_10min` | `test/knock-budget.test.mjs` |
| module contract | every module exports the contracted shape and dispatches | `test/fun-bench-scenario-modules.test.mjs` |

Result on this tree: 34 tests, 34 pass, exit 0 (`scratch/feel-scenarios.log` in the session; the
same command is the gate's).

## The three edits outside the scenario files

- `design/FEEL_CONTRACT.md` B5 now cites `feel.shove_magnitude` (its displacement clause, screen
  depths two seconds after the hit) instead of a `feel.shove_displacement` id no module has ever
  had. The instrument column is a pointer to a real scenario, which is what the done-when asks.
- `scripts/check-ci-report.mjs` smoke list gains `feel-scenarios` with the long timeout.
- `tools/agentic/scenarios.json` gains the thirteen `feel.*`/`world.*` entries (id, bar, module,
  the measurer command that runs one, the metrics it prints). `python tools/agentic/validate_control_plane.py`:
  `CONTROL_PLANE_VALID`.

## What this does not claim

The bars themselves are as they are: B2/B3/B4/B5/B6-damage/B8/B11 are still OPEN in the contract
and print their honest numbers; this unit puts the instruments in the gate, it does not move the
guts (PQ-137.03/.04/.05/.06/.08 own those). B7 moved in PQ-137.07 in this same run.
