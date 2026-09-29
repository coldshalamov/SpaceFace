# FB-022 — Storm relays and cryo props are physics bodies a Massline can reposition

**Kind:** build · **Lane:** THE FIGHT · **Routing:** open
**Seam tags:** seam: stormLatticeArena.js, seam: cryoDriftArena.js, seam: survivalArena.js
**Write-set:** `src/systems/stormLatticeArena.js`, `src/systems/cryoDriftArena.js`, `src/systems/survivalArena.js`, `test/fb-arena-props-are-bodies.test.mjs`
**Neighbours (extend, never restate):** SFQ-B056, NXB-019, NXI-075, SF-071

## The gap
The four law arenas install fields and pylons the player cannot shoot, move or throw; only `planFoundryToys`
and four arena mines are interactable. `placeStormRelays` positions relays on an orbit-node period and
`CRYO_PROP_RADIUS` places props, both as decoration. Adjacent to SF-071 (an arena law that creates
opportunity), which composes a law; this makes the law's furniture physical.

## Why this direction
More toys were rejected; the props exist. Registering them as bodies through the same owner path the arena
mines use (`mines:placeRequest`-style ownership) lets the signature verb act on the arena.

## Mechanism
- Give storm relays and cryo props real dynamic bodies (mass from prop class) owned by the arena systems,
  tetherable and shootable, with the arena re-anchoring a relay that drifts out of its orbit band.
- Make the relay's function follow its body: a relay dragged into a lattice cell changes which cell arcs; a cryo
  prop thrown into a warm quadrant cools it for a window.
- Pin in a fixed-seed scenario that a tethered relay moves ≥ 40 WU and the lattice arc pattern changes
  accordingly.

## Done when
`test/fb-arena-props-are-bodies.test.mjs`: relay latch, drag distance and arc-pattern change on seed 4242;
`pq-174-04-arena-laws.test.mjs` and `pq133-09-cryo-storm.test.mjs` stay green.

## Do not
Do not add props. Do not let props knock the player around (player is never tumbled). Do not add drag to
props.

## Focus test starting points
- `test/pq-174-04-arena-laws.test.mjs`
- `test/pq133-09-cryo-storm.test.mjs`
- `test/pq-175-01-arena-toys.test.mjs`
