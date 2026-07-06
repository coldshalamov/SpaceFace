# BP-07 — FLIGHT & TRAVERSAL

> **Extends** `SPEC3-F3` (§16 flight-model, §17 tether-momentum). Pillar 1: *momentum is the toy*.
> **Highest golden-risk lane — schedule LAST and consult the advisor before touching the flight model.**

## Goal
Lock the *feel* the GDD already specifies, and add the connective travel fantasy (ring lanes) — without
breaking the deterministic flight goldens.

## Scope
- [ ] **Helm Assist tuning** to GDD targets: nose follows cursor (response <50 ms), scout 90° turn <0.45 s,
      hauler ~1.4 s; **Space = brake-to-stop** (counter-thrust with VFX, full stop from cruise <2.5 s).
- [ ] **Mass wired to handling** — accel = thrust/mass, turn = turn/mass; a loaded hauler flies sluggish
      (currently `ships.js` mass isn't wired to `flightDynamics.js`). Cheapest depth gain.
- [ ] **Inertial dampener / drift** — Z toggles assist-off; 0.4 s velocity-blend on re-engage.
- [ ] **Ring-lane highways** — physical ring structures (BP-08 gate variants) connect economically-linked
      sectors; entering accelerates you along a lane; a **destroyed ring** (pirate beat via `encounterDirector`)
      drops you into a danger pocket. Hostile factions don't share clean ring networks (manual flight only).
- [ ] **Tether traversal/combat uses** — wire the dormant momentum toy: yank light hulls, tow wrecks (with
      `salvage.js`), slingshot around asteroids.

## Primary files
`src/systems/flightV3.js` (sole owner — nothing else touches flight in its wave), `src/systems/cruise.js`
(ring-boost mode), `src/systems/tetherGameplay.js`, ring data in `sectorAnchors`/`sectorZones` + `world.js`
(traversal — orchestrator-gated).

## Acceptance
`check:flight:clean` + `check:juice-contract` stay green; **diff flight telemetry against the captured baseline**;
ring entry accelerates and a destroyed ring drops the player into a hazard; brake-to-stop hits the <2.5 s target.

## Dependencies
Baseline snapshot; BP-08 ring-gate GLBs; `encounterDirector` (ring-ambush beat); advisor sign-off.
