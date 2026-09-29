# FB-140 — Wreck ecology events mark and unmark the map: a seeded wreck, a scavenger at work, a wreck gone

**Kind:** wire · **Lane:** THE WORLD · **Routing:** open
**Seam tags:** seam: aftermathWrecks.js, seam: galaxyMap.js, seam: marketNews.js
**Write-set:** `src/systems/aftermathWrecks.js`, `src/ui/galaxyMap.js`, `src/ui/marketNews.js`, `test/fb-wreck-ecology-marked.test.mjs`
**Neighbours (extend, never restate):** SF-286, NXB-007

## The gap
`wreckEcology:seeded`, `wreckEcology:scavenged`, `wreckEcology:departed` and `wreckEcology:decayed` are
emitted with no listener. The player's own kills become wrecks with scavengers and a decay clock and none of
it reaches the map or the news. Adjacent to SF-286 (first victory becomes the first useful wreck) and NXB-007
(one kill, one aftermath): this is the ecology's visibility after the aftermath is settled.

## Why this direction
A wreck the player made is a place; the map marker and a news line are the two consumers that make it one.

## Mechanism
- Subscribe the galaxy map's marker data path to seeded/decayed (add/remove a wreck marker with the cause) and
  `marketNews.js` to scavenged/departed (a cited line).
- Pin marker lifecycle and two lines on a seed-4242 kill→scavenge→decay script.

## Done when
`test/fb-wreck-ecology-marked.test.mjs`: marker appears and clears, two cited lines;
`pq-154-01-wreck-ecology.test.mjs` stays green.

## Do not
Do not mark NPC-vs-NPC wrecks the player never saw. Do not add a wreck screen.

## Focus test starting points
- `test/pq-154-01-wreck-ecology.test.mjs`
- `test/aftermath-scavenger-work-loop.test.mjs`
