# FB-125 — The research, fab, debris and wormhole POI types exist more than once, each with its family's verb

**Kind:** build · **Lane:** THE WORLD · **Routing:** open
**Seam tags:** seam: sectors.js, seam: frontierRegions, seam: poiBehaviorFamilies.js
**Write-set:** `src/data/sectors.js`, `src/data/frontierRegions/east.js`, `src/data/frontierRegions/north.js`, `src/data/poiBehaviorFamilies.js`, `test/fb-poi-types-company.test.mjs`
**Neighbours (extend, never restate):** SFQ-B109, SFQ-B110

## The gap
POI type counts: beacon 10, cache 8, derelict 6, wreck 5, anomaly 5, colony 4, blackmarket 4, and one each of
wormhole, research, fab and debris. The behaviour families (`poiBehaviorFamilies.js`, seven families) give a
research POI a plan and a verb; a type that exists once is a mechanism that supports many with one instance.
The brief names this gap class directly.

## Why this direction
More POIs of the common types were rejected (density is not identity). One more instance each of the four
singletons, placed where the sector's way of life explains it, with the family verb already authored.

## Mechanism
- Author a second research POI (a frontier research station's field lab), a second fab (the Forge's outlying
  yard), a second debris field (Ashfall) and a second wormhole candidate (Veil's far side) in the sector data.
- Bind each to its behaviour family so the plan/readout path (see FB-035) applies.
- Pin type counts ≥ 2 for all types and that each new POI resolves a family plan on seed 4242.

## Done when
`test/fb-poi-types-company.test.mjs`: no POI type with count 1, four family plans resolved;
`living-poi-behaviors.test.mjs` and `world-one-offs.test.mjs` stay green.

## Do not
Do not add a fifth POI type. Do not place a POI without a family. Do not touch the ending-C wormhole rules.

## Focus test starting points
- `test/living-poi-behaviors.test.mjs`
- `test/world-one-offs.test.mjs`
