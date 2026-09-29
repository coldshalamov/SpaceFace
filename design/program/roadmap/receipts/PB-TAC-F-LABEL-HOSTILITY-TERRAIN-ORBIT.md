# PB-TAC-F — lawful-motive verify · terrain-aware orbit

Row: `build_map.md` #92 (SF-058 + SF-059). CHECK pair — verify first, build the gap.

## What landed

`src/ai/maneuver.js`, `test/pb-tac-f-label-orbit.test.mjs` (new).

- **SF-058 verify: friendly traffic is not a target by label — already satisfied, now pinned.**
  The equivalent mechanism exists and was audited end to end rather than rebuilt: team-2
  civilians are never auto-hostile (`isHostileForAI` floor), a same-team pair needs a named
  incident (`securityTargetId` / `retaliationTargetId` / authored first-fire) before either side
  is hostile, a grazed jettisoned pod stamps retaliation on the *pod* — never the owning hauler —
  while a direct hull hit legitimately names the attacker, and station protection converts
  `_retaliate` into a `protected_withdrawal` while `authorizeAIEngagement` denies a non-lawful
  pursuer `station_protection` inside the ring. `isHostileToPlayer`'s archetype labels exclude
  miner/trader/civilian traffic; `pirate` labels are authored hostile roles, not resemblance.
  Four regression tests pin the contract against future label/team shortcuts: label-only pairs
  stay cold, retaliation stays attacker-scoped (bystander never inherits it), pod-strike does
  not aggro the owner while a hull hit does, and the protection boundary ends fire (denied
  under the ring, allowed in open lane).
- **SF-059 terrain-aware orbit** — `orbit()` gains a bounded fan of nine rotations
  (±1.35 rad max, so the authored orbit side can never flip) swept corridor-style against the
  perceived obstacle set via `orbitObstacleFreeRun` — the same ahead/across ray-vs-circle and
  clearance math `applyObstacleAvoidance` already uses, mirrored so live ships and the orbit
  target stay exempt. The pick prefers feasible rays, then the widest contiguous clear arc, then
  alignment with the hull's present velocity (a hull already skimming keeps skimming instead of
  re-selecting the blocked tangent — implicit hysteresis with no extra state), then smallest
  rotation. It runs only for `ORBIT` + live target, recomputes every plan so the authored
  tangent+radial blend returns byte-identically once the ring ahead is clear, and feeds
  steering through the ordinary `desired` → thruster-request → aiPorts path — no pose repair,
  no perfect-knowledge pathfinding (it sees only perception contacts). Sweeps are counted via
  `countContactVisit` so the contact-index instrumentation stays honest.

## Measured before/after

Deep-wall fixture (ring's east arc swallowed by a 150-WU solid): reactive dodge took over the
steering plan 140/1800 ticks before the fan, 39/1800 after — the dodge is now a backstop, not
the plan. Wall penetration never happens in either version (the dodge always kept the hull out);
the change is the *character* — continuous skim instead of repeated emergency reroutes.

## Checks

- `test/pb-tac-f-label-orbit.test.mjs` — 7/7 green (4× SF-058 pins, 3× SF-059 incl. determinism).
- Adjacent: `combat-ai-intentional-movement` 13/13, `ai-engagement-authority`,
  `law-responder-doctrine`, `ceres-job-law-response`, `pirate-predation-authority` 51/51 —
  all green.
- Reviewer: PASS (static trace + test-honesty audit; no blocking findings).

## Residual

- Squad-choreographed orbits (live `squadFrames` plan → `commitPoint`) bypass `desiredForIntent`
  entirely and keep dodge-only terrain behavior — flagged non-blocking.
- Route-unproven: asserted through the real `ManeuverPlanner.plan` thruster channel, not a
  rendered flight.
