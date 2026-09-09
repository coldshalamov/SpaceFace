<!-- LIFETIME: RECEIPT -->
# PQ-140.00 — Interceptor is a positioning problem

```text
DONE  PQ-140.00 — crossing lanes and extend-and-return geometry. The interceptor is never a stationary target and commits through the pass without decelerating into a hover. Scenario metric: player spends 91.7% of time off the interceptor's attack line (gate: ≥ 75.0%). Visual capture generated with readable lane geometry.

WHAT I FOUND     Interceptors nose-in directly to the target and trigger arrival deceleration and closing speed limits, collapsing speed into a stationary hover at gun range. The interceptor posed a DPS/arithmetic check rather than a readable physical positioning problem.

WHAT I CHANGED   
1. Authored crossing lanes: `intercept()` computes a 55–120 WU tangent corridor offset (expanded for heavy/capital clearance) so the interceptor cuts past the target at speed rather than ramming or stalling.
2. Committed momentum: `approachSlowRadius` returns 0 for crossing-lane intercepts; `closingLimited` and arrival braking are bypassed during crossing passes; through-velocity is projected along the crossing vector into `feedVel` at ≥ 72 WU/s.
3. Attack threat line: `attackLineFor()` defines the transient threat corridor (origin, heading, range, half-width 32) active only during telegraph and strike phases; tacticalAI emits `attackLine` in `ai:telegraph` and `ai:doctrinePhase` bus events.
4. Two waves of adversarial review addressed 9 defects (defensive velocity sanitization, collocated position heading fallbacks, capital clearance clearance paradox resolution, lateral strafe authority preservation, hot-loop GC cache stabilization, and complete test suite coverage).

WHAT YOU WILL FEEL   An interceptor that charges past you in a fast, sweeping crossing pass. You see its engine flare and attack beam telegraph, dodge laterally out of the corridor, and watch it overshoot at high speed rather than stopping to hover and trade DPS.

THE NUMBERS      bar | before | after | target
                 interceptor min speed during run | 0 WU/s (stall/hover) | 40.0+ WU/s (never stationary) | > 0 WU/s
                 exit speed out of pass | 0–18 WU/s | ≥ 60.0 WU/s | ≥ 60 WU/s
                 player time off attack line | ~0% (hover tracking) | 91.7% (165 / 180 ticks) | ≥ 75.0%
                 adversarial review waves | 0 | 2 waves (4 specialized subagents) | multi-wave green

THE FRAMES       design/program/roadmap/receipts/PQ-140-00-crossing-lane.png. Ledger: PQ-140-00-metrics.json. Top-down tactical visualization at 1280x720 showing interceptor tangent crossing trajectory, 480 WU threat corridor with 32 WU half-width, and dynamic player evasion path.

NEXT             PQ-140.01 Heavy is moving terrain.
```

## Review

Audited by two waves of adversarial subagents:
- Wave 1:
  - AI Mechanics and Doctrine Auditor (`c5e82946-98f2-4b9b-9997-23e85810538b`): Identified missing target velocity guards, collocated position corridor collapse, and JSDoc/implementation phase mismatches. All resolved.
  - Combat and Physics Invariant Auditor (`6df57e41-9357-4ef1-ab7b-6d004816fcfa`): Identified capital ship clearance envelope paradox and lateral strafe damping during crossing maneuvers. All resolved.
- Wave 2:
  - Performance and Sim-Loop Allocations Auditor (`41f37a2e-8546-46b7-a487-a83d00be1397`): Fixed frozen object caching, pre-declared record fields to stabilize V8 hidden classes, deferred `predictFormationSlot` allocations, and eliminated dictionary-mode transitions in tactical AI.
  - Crucible and Feel Contract Auditor (`ad4dd4e4-df12-4dc1-bfdd-af2e2a9fa3a8`): Verified compliance with `FEEL_CONTRACT.md` (no drag, no given-momentum clamping, single-writer contracts intact, universal AI shared across Adventure and Crucible).

## Checks

| Check | Result |
|---|---|
| `node --test test/pq-140-00-interceptor.test.mjs` | 9 pass (100%) |
| `node --test test/combat-doctrines.test.mjs test/professional-enemy-maneuvers.test.mjs test/combat-ai-intentional-movement.test.mjs` | 10 pass (100%) |
| `npm run check:combat` | 8 checks passed + save/reload checks OK |
| `node scripts/capture-pq140-00-interceptor.mjs` | green (capture + metrics JSON generated) |

No new AI forks. No new hull models. No cheat physics.
