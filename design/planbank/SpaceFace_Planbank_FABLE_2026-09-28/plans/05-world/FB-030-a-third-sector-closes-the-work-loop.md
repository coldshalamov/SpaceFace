# FB-030 — Pallas Drift runs the miner→hauler→refinery→ambush→escort loop end to end, not only Ceres

**Kind:** build · **Lane:** THE WORLD · **Routing:** open
**Seam tags:** seam: sectorActivityPockets.js, seam: traffic.js
**Write-set:** `src/data/sectorActivityPockets.js`, `src/systems/traffic.js`, `test/fb-pallas-activity-pockets.test.mjs`
**Neighbours (extend, never restate):** SFQ-B082, PB-LANE-WORLD, SF-078

## The gap
`ACTIVITY_POCKETS_BY_SECTOR` authors pockets for two sectors: Ceres (four pockets, eight slots, the full
chain) and Helios (two pockets, and security 0.98 zeroes pirates). No sector besides Ceres closes the loop.
The pocket grammar is pure data (`{ id, jobKind, offset }` slots); the only Ceres-hardcoded piece is
`CERES_ACTIVITY_CAST`, which is slot-driven. Composes after the parked PB-LANE-WORLD row (board row 158,
SF-078…090 pocket packets): take this when that claim releases, or as that lane's next unit.

## Why this direction
Authoring twenty-four sectors of pockets was rejected; one mid-security sector with existing fields and zones
(Pallas: three fields, three zones, pirate weight 5) proves the grammar generalizes and gives the frontier its
first working place.

## Mechanism
- Author `+PALLAS_ACTIVITY_POCKETS`: a working seam (miner + surveyor), a hub pocket (hauler + tender), an
  ambush run (loaded hauler + escort), and a nebula grave (salvor + patrol), reusing the slot shape.
- Generalize the cast lookup in `traffic.js` so a sector's cast is keyed by sector id with Ceres as one entry.
- Pin the chain on seed 4242: a Pallas miner hands off to a hauler, the hauler reaches the hub, an ambush fires
  on the run, an escort answers.

## Done when
`test/fb-pallas-activity-pockets.test.mjs` pins the four handoffs in order within 20 minutes on seed 4242;
`ceres-active-pockets.test.mjs` and `helios-activity-pocket-chain.test.mjs` stay green.

## Do not
Do not copy Ceres' pocket ids. Do not raise ambient counts. Do not add a fourth sector in this packet.

## Focus test starting points
- `test/ceres-active-pockets.test.mjs`
- `test/helios-activity-pocket-chain.test.mjs`
- `test/inf-068-convoy-wreck-pocket.test.mjs`
