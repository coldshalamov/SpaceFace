# DEMO-SIMFIX-2 — enemies do not all think on the same tick

**For:** a builder agent (careful sim work). **Kind:** measured performance fix (director's ruling:
the change of fight outcome is accepted). Commit your own files.

In Swarm round 6 all ~16 hostile hulls run their tactical "think" on the same tick (every third step),
which costs ~10 ms on that step (half of it building sensor frames) and spikes the simulation step.
Spread the thinks across ticks the way current games do: each hull thinks on its own phase, chosen
deterministically (e.g. `(id * 2654435761 >>> 0) % period`, or by stable slot), so ~1/3 of the hulls
think each step at the same cadence per hull. Steering and firing stay every step.

Director's ruling: this changes which tick each hull decides on, so fights play out slightly
differently; that is accepted. Keep it deterministic. `npm run check:sim` runs with tactical AI off
(per the engineers' report) — confirm that and that its hash does not move because of this change.

Find the think scheduler (src/systems/tacticalAI.js and the AI step it calls; the profiler sub-rows
`tacticalAI.think`). Note commit 706ebc63ef already fixed an aliasing between the 20 Hz think and the
per-hull refresh stagger — read it so the new phases do not re-alias with that stagger.

Measure: `node scripts/bench-sim-fight.mjs --scene=swarm6 --profile` before/after (fresh processes,
several runs; the machine is loaded), and the per-step max/p95 of the AI row. Behind a simCoreFlags
switch (default on). Focused AI tests; a test that pins all hulls thinking on one tick gets the new rule.

## Rules
Before editing a file run `git diff -- <file>`; if it has changes you did not make, use
`bash scripts/fleet/own-commit.sh begin <file>` before and `... commit "<msg>" <file>` after. Never
git add -A, reset, stash, restore or checkout. Write RECEIPT.md early and update it.

## Receipt
Protocol headings; the scheduler change (file:line, commit); AI row p50/p95/max before/after; tests.
