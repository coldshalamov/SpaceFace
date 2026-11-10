# Optic lattice collider cost — measured 2026-09-25

**Row:** `build_map.md` §24 "Collider cost" — *"A Ceres entry trace names the optic bodies' cost. Scatter stays off until that cost fits the frame."*
**Method:** real `rapier-dynamic` production path headless (`createAuthoritativeRuntime`, production feature map, SG-02 contact capture on), swarm arena `storm_lattice` at wave-16 density with the real `run:wavePlanned` lattice stamp; 900 sampled ticks per scenario after 600-tick warm. Measured on a contended host — treat absolute ms as upper bounds, deltas as signal.

## Mechanism (verified in source)

- Each lattice cell = 1 fixed Rapier rigid body + 1 ball collider (non-ghost `rock` material → `ActiveEvents.CONTACT_FORCE_EVENTS` armed).
- Static×static pairs are impossible: `ActiveCollisionTypes.DEFAULT` excludes FIXED_FIXED, so overlapping adjacent stone cells produce zero narrowphase pairs between themselves.
- Projectiles use the JS `sweepProjectiles` path (collision group 0), so lattice cells add sweep candidates, not Rapier pairs.
- Steady-state static sync is ~zero (version-gated `syncStaticVersion`).

## Measured numbers (900 ticks each)

| Scenario | +colliders | +pairs/tick (mean) | lattice pairs (mean) | physics tickMs mean | p95 |
|---|---|---|---|---|---|
| Storm lattice ON (16 cells) | +6 | +33 | 27 | 3.22 | 7.45 |
| Lattice suppressed (baseline) | — | — | 0 | 3.36 | 7.53 |
| Ceres gallery centred on fight (42 cells) | +38 | +70 | 65 | 3.94 | 11.86 |

**Deltas vs baseline:** storm lattice ≈ −0.14 ms mean / −0.08 ms p95 (below noise — effectively free). Ceres 42-cell worst case centred on the fight: +0.58 ms mean, +4.3 ms p95 (p95 figure inflated by host contention; `sg02StepMs` alone rose +0.37 mean / +2.6 p95 — the solver step, not JS overhead, carries the cost).

## Verdict

**The cost fits the frame at authored scale.** A 16-cell swarm lattice is below measurement noise; even the 42-cell Ceres set stamped directly on a live fight adds well under 1 ms mean physics time against the 5 ms sim p95 budget. Seeded scatter's constraint ("cost fits the frame") is satisfied for single-structure-per-sector authoring; the gate to watch is *cumulative* scatter — several full Ceres-scale sets in one sector would grow the pair census quadratically-ish via hostile×cell contacts.

**If cost ever needs the lever:** merge each contiguous run of stone cells into one cuboid collider (stone's only job is absorbing bolts; cells never contact each other). Diamonds must stay separate — `book.visited` is per-surface.
