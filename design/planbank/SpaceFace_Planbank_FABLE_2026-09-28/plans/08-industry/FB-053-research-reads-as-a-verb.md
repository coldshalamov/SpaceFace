# FB-053 — Every research node reads as what you can do now, using the verb ladder that already exists

**Kind:** wire · **Lane:** THE LONG GAME · **Routing:** open
**Seam tags:** seam: techVerbLadder.js, seam: techTree.js, seam: tech.js
**Write-set:** `src/data/techVerbLadder.js`, `src/ui/screens/techTree.js`, `src/data/tech.js`, `test/fb-research-reads-as-verb.test.mjs`
**Neighbours (extend, never restate):** SFQ-B099

## The gap
`TECH_VERB_LADDER` authors a one-line verb for all 32 nodes (`verbForNodeId`) and is imported only by
`economy.js` for a curve check; `techTree.js` never reads it, so research reads as "170 → 212". The three
`STRICT_STAT_ONLY_IDS` (`tech_drone_swarm`, `tech_autonomous_fleets`, `tech_outpost_charter`) carry real verb
keys (`extraDronePerBay`, `npcTraderHiring`, `outpostConstruction`) with live consumers and are mislabelled as
stat-only. Efficiency riders are folded and never printed.

## Why this direction
The highest-leverage one-line wiring in the domain. Importing the verb into the constellation reading is a
functional edit; relabelling three nodes is honest data.

## Mechanism
- Import `verbForNodeId` into `techTree.js` and use it as each node's reading; print the efficiency rider as a
  second line where present (functional edit, ORRERY-consistent).
- Move the three logistics nodes out of `STRICT_STAT_ONLY_IDS` with their verb sentences; keep
  `countVerbVsStatOnly` honest.
- Pin that all 32 nodes render a verb and the count is 32/0.

## Done when
`test/fb-research-reads-as-verb.test.mjs`: 32 verbs rendered, zero stat-only; `pq-155-00-verb-ladder.test.mjs`
stays green.

## Do not
Do not restyle the constellation (ORRERY). Do not change costs. Do not add nodes.

## Focus test starting points
- `test/pq-155-00-verb-ladder.test.mjs`
