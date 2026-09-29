# FB-033 — The travel lane vocabulary covers the galaxy, not only Helios to Tethys

**Kind:** build · **Lane:** THE WORLD · **Routing:** open
**Seam tags:** seam: travelLaneRoutes.js, seam: travelLanes.js
**Write-set:** `src/data/travelLaneRoutes.js`, `src/systems/travelLanes.js`, `test/fb-more-than-one-lane.test.mjs`
**Neighbours (extend, never restate):** SFQ-B103, NXB-036

## The gap
`TRAVEL_LANES` holds exactly one lane (`lane_helios_tethys`) in a 24-sector graph; `buildLaneGeometry(from, to)`
is fully generic. "The lane" is a two-sector vocabulary, and `lane:disrupted` has no listener.

## Why this direction
Each additional lane is one `{ id, name, from, to }` row against an existing atlas edge; the boost, contacts
and the Ceres sling ring already work per lane.

## Mechanism
- Author five more lanes on the busiest atlas edges (Helios–Ceres, Ceres–Vesta, Tethys–Pallas, Tethys–Dione,
  Io–Charon), each with a name and a named lane contact from `laneContacts.js`.
- Give `lane:disrupted` a listener in market news (a headline with the lane name) so a disrupted lane is world
  evidence.
- Pin that lanes do not overlap geometrically and that each carries at least one contact on seed 4242.

## Done when
`test/fb-more-than-one-lane.test.mjs`: six lanes, no overlap, one headline on a scripted disruption;
`travel-lanes.test.mjs` and `freight-lane-attrition.test.mjs` stay green.

## Do not
Do not add a second lane system. Do not make lanes mandatory for jumps. Do not add drag off-lane.

## Focus test starting points
- `test/travel-lanes.test.mjs`
- `test/freight-lane-attrition.test.mjs`
