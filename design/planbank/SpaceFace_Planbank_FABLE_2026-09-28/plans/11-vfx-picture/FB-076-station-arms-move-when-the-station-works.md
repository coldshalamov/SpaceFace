# FB-076 — Cranes, docking arms and loaders articulate on the station side events that already fire

**Kind:** build · **Lane:** THE PICTURE · **Routing:** open
**Seam tags:** seam: infrastructureMotion.js, seam: stationSideEventVfx.js
**Write-set:** `src/render/infrastructureMotion.js`, `src/render/stationSideEventVfx.js`, `test/fb-station-arms-articulate.test.mjs`
**Neighbours (extend, never restate):** SFQ-B187, SF-215

## The gap
`createInfrastructureMotionTracker` moves gates, station rings and wrecks; there is no crane, docking-arm or
loader class anywhere in `src/render/`. `station:sideEvent` already has a VFX grammar
(`STATION_SIDE_EVENT_VFX_PROFILES`) but no mechanical motion behind it, so a "cargo tractor" event is light
with nothing that reaches. Adjacent to SF-215 (one quiet machine's residual life); this is the working motion
of the six side events.

## Why this direction
Constant decorative spinning was rejected (SF-215's law). The side events are the real operating state; keying
articulation to them makes motion mean work.

## Mechanism
- Add a fourth tracker class keyed off the same `stationId` the dock pulse uses: arm bones on the station
  model's named nodes swing to a target and return over the event's duration.
- Drive it from `station:sideEvent` per profile (hauler_dock → arm reach; cargo_tractor → loader stroke;
  repair_drone → gantry slide).
- Reduced motion halves amplitude but keeps the reach direction.

## Done when
Seed 4242 docked at Ceres for 300 s: each of the six side events produces one articulation record with a start
and settle; `test/fb-station-arms-articulate.test.mjs` pins the mapping; `infrastructure-motion.test.mjs`
stays green.

## Do not
Do not author new station geometry (graphics lane). Do not animate when no side event is live. Do not move
collision geometry.

## Focus test starting points
- `test/infrastructure-motion.test.mjs`
- `test/station-side-event-vfx.test.mjs`
