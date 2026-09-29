# FB-043 — Three of the six placeless factions gain a station to return to

**Kind:** build · **Lane:** THE WORLD · **Routing:** open
**Seam tags:** seam: frontierRegions, seam: factions
**Write-set:** `src/data/frontierRegions/west.js`, `src/data/frontierRegions/south.js`, `src/data/factions/archive.js`, `src/data/factions/understory.js`, `src/data/factions/helix.js`, `test/fb-factions-get-a-door.test.mjs`
**Neighbours (extend, never restate):** SFQ-B116

## The gap
Seven factions own sectors and stations; six (helix, understory, fulfillment, archive, pitborn, verge_layers)
own no place at all. `helix.js` and `fulfillment.js` declare `homeSectors: []`. They have palettes, doctrines
and encounters, so they are visible and unvisitable, which reads as a content gap, not a design choice.

## Why this direction
New stations were rejected (graphics lane). Eight frontier stations are single-station sectors with generic
owners; reassigning three `factionId` fields gives three factions a door with no new art. Fulfillment, pitborn
and verge_layers stay encounter-only on purpose (their fiction is mobile).

## Mechanism
- Reassign `station_orcus_shadow` → archive (research), `station_eunomia` → understory (blackmarket), and one
  west-region research station → helix; set the matching `homeSectors`.
- Confirm rep gating, market ownership and the dock greeting (`bar-faction-greetings.test.mjs` path) resolve for
  the new owners.
- Pin ownership, dock access at neutral rep, and the faction's presence spawns near its home on seed 4242.

## Done when
`test/fb-factions-get-a-door.test.mjs`: three stations owned, dockable, greeting in the right register;
`bar-faction-greetings.test.mjs` and `deep-faction-voice.test.mjs` stay green.

## Do not
Do not author new stations. Do not move core-sector ownership. Do not give the mobile factions a door.

## Focus test starting points
- `test/bar-faction-greetings.test.mjs`
- `test/deep-faction-voice.test.mjs`
