# PB-SLICE-D — SF-291 + SF-293: the same rope proves two careers + a heavy enemy becomes temporary terrain

**Status:** implemented · route-proven at the focused seam
**Commit:** see row 79 on `build_map.md`
**Date:** 2026-09-28

## What the slice is

Two claims, one packet:

- **SF-291** — the player's Massline has two careers (a controlled combat throw, a careful
  industrial tow) and each reveals a real build tradeoff on an ordinary legal fit.
- **SF-293** — a heavy enemy that dies mid-fight becomes real temporary terrain: the wreck is
  a dynamic body the survivors (and the player) route around, and moving it reopens the lane.

## What was already true (equivalent-feature gate)

Both seams were mostly standing already; the packet closed the missing reveal rather than
rebuilding machinery:

- **Wreck-as-terrain (SF-293)**: `aftermathWrecks` records a durable marker per kill and
  materializes a live `wreck` body in the same sector tick (player kills and same-sector NPC
  kills alike). The body carries the victim's real mass/radius/momentum, is `collides:true`
  `dynamic:true`, classifies as `ContactKind.HAZARD` in `aiPorts` (obstacle routing, brake,
  side-choice), blocks `witnessLineOfSight`, is latchable + throwable, and its salvage pool is
  the marker's own residue. Cleanup is bounded: arena cap retires the FARTHEST body with a
  `aftermathWreck:retired` receipt; ordinary-sector marker trim evicts the OLDEST memory and
  never protected markers (player hull, mission-pinned). PQ-154 already pinned each link.
- **Two careers (SF-291)**: the onboarding RAID beat teaches the throw (crippled 220 t hulk +
  a downrange target rock, 12 s whip-kill credit window); the `tow_recovery` economy contract
  is a real physical recovery (slag core, `tow_in` or `sling_in` completion); the fit tradeoff
  catalog is authored and purchasable (Heavy-Duty Winch / Massline Spools / head variants /
  engine upgrades), and `shipCapabilities` grades the fit's tow class + line rating on the
  fitting screen. What was missing: nothing connected a *felt* strain to those numbers.

## The production delta

`src/systems/onboarding.js` — two once-only `player.hints` beats wired to **measured** strain
(the game's own `towClassMassFor` capability law, not a scripted threshold):

- `tether:latched` on a **dynamic** body heavier than the fit's tow class → `masslineTowClass`:
  "That load is past your drive's tow rating — it will haul, just slowly. A stronger drive
  raises the class." Anchored endpoints (stations, planet bodies, ordinary rocks) are excluded
  via `resolvePhysicsBodySpec(...).dynamic` — hitching a fixed mass rides the hull, it isn't a
  tow, and the line would lie.
- `tether:whipImpact` where the thrown `mass` exceeds the same tow class →
  `masslineThrowClass`: "You just threw a mass your drive cannot tow — a winch kit cinches the
  next swing faster." Gated on `massline2Flag('throw')` like every sibling massline beat.

Both are plain once-only hints: refusal is just never buying the named fit — nothing gates,
which is exactly the spec's "a player who refuses the suggested upgrade can continue." The
opportunity machinery (RAID throw beat, tow_recovery contract) was already reachable and is
untouched.

`test/pq-154-wreck-terrain.test.mjs` — one binding SF-293 case: a heavy dies with its wing
still alive; the hulk materializes same-tick, its collision proxy closes the lane, displacing
the body reopens it, and over-cap kills retire the oldest field memory while the freshest kill
(the body the fight is still working) always survives.

## Checks

- `test/sf-291-rope-careers.test.mjs` — 6/6: past-class latch earns the tow beat once;
  in-class load teaches nothing; anchored endpoint never counts as a tow load; whipped mass
  past class earns the throw beat once; light throw silent; flag-off silent; the two careers
  are independent beats.
- `test/pq-154-wreck-terrain.test.mjs` — 7/7 including the new fight-continuation/displacement
  binding case.
- Adjacent: `inf-062-latch-denial-hint`, `bomb-first-use-hint`, `flight-drill-onboarding`,
  `inference-first-frontier-hint`, `first-use-keys-*` — all green.

## Known limits / honest edges

- The hints name the *rating* and the fit that moves it (drive / winch kit); they do not deep-
  link the fitting screen. That matches the existing hint register's terse style.
- `masslineTowClass` measures the *drive's* tow class, which is the honest physical constraint
  for hauling a load under way; winch/spool fits improve cinch speed and reach rather than the
  tow class — the throw beat is where the winch is named.
- SF-293 required no new runtime code — the acceptance case composes out of PQ-154 machinery;
  the new test is the binding proof, not a claim of new behavior.
