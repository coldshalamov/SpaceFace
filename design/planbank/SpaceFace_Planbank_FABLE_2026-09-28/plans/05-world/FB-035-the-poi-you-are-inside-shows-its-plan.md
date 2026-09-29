# FB-035 — A living POI's plan, progress and guidance reach the local map and radar labels

**Kind:** wire · **Lane:** THE WORLD · **Routing:** open
**Seam tags:** seam: livingPoiBehaviors.js, seam: localmap.js, seam: radar.js
**Write-set:** `src/systems/livingPoiBehaviors.js`, `src/ui/screens/localmap.js`, `src/ui/radar.js`, `test/fb-poi-plan-visible.test.mjs`
**Neighbours (extend, never restate):** SFQ-B105, SF-124

## The gap
Of the six POI behaviour events, only `poi:behaviorOutcome` has a listener. `poi:behaviorPlanned`,
`poi:behaviorReadout`, `poi:behaviorGuidance`, `poi:behaviorProgress` and `poi:cargoObserved` reach nothing.
`readoutOf(row)` already returns `{ mapLabel, radarKind }`, which are the two fields the local map and radar
render for zones.

## Why this direction
A POI panel was rejected. The readout shape already matches the two instruments; binding it is a functional
edit in each.

## Mechanism
- Publish the readout on `state.world` per POI so the map and radar read it without subscribing (single reader
  path, quiet when absent).
- Render `mapLabel` on the local map zone marker and `radarKind` as the blip class; progress becomes a small arc
  on the marker.
- Pin that a seed-4242 mining-field family shows a plan label and progress within the first cycle.

## Done when
`test/fb-poi-plan-visible.test.mjs`: the map model carries label and progress for a live family and nothing
for a dormant one; `living-poi-behaviors.test.mjs` stays green.

## Do not
Do not add a new map layer file. Do not expose hidden outcome odds. Do not restyle markers (ORRERY).

## Focus test starting points
- `test/living-poi-behaviors.test.mjs`
