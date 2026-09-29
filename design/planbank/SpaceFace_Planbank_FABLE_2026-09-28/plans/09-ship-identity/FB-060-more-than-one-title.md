# FB-060 — Three more earned titles from counters the game already keeps, with succession

**Kind:** build · **Lane:** THE LONG GAME · **Routing:** open
**Seam tags:** seam: titles.js, seam: achievements.js
**Write-set:** `src/data/titles.js`, `src/systems/titles.js`, `test/fb-more-than-one-title.test.mjs`
**Neighbours (extend, never restate):** SFQ-B113, SFQ-B118

## The gap
Exactly one authored title exists (`THUNDERCHILD`: a threat-ratio hold with an aura and succession on death).
`TITLES` is an array and `authoredTitleId` already parses succession keys, so the system is n-title ready. The
achievement counters (razor releases, crushing impacts, rescues, wanted clears) already exist.

## Why this direction
Recognition is the ship-identity payoff. Three titles from three different verbs (a hauler's, a rescuer's, a
stunt pilot's) with the same aura/succession law is data plus tests.

## Mechanism
- Author three titles in `src/data/titles.js` keyed to existing counters: a rescue title (survivor pods
  delivered), a line title (razor releases), a quiet title (wanted cleared without a kill), each with a small
  aura and news lines.
- Reuse the succession path so a title passes on death.
- Pin the earn conditions on seed 4242 scripts and mutual exclusivity of the aura stacks.

## Done when
`test/fb-more-than-one-title.test.mjs`: each title earned by its script and not by the others;
`depth-program-s4-thunderchild.test.mjs` stays green.

## Do not
Do not add stat bonuses beyond the aura law. Do not add a titles screen (footprint shows them). Do not gate
missions on titles.

## Focus test starting points
- `test/depth-program-s4-thunderchild.test.mjs`
- `test/pq146-02-titles-ledger-bark.test.mjs`
