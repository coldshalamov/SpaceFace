# FB-027 — Swarm champions borrow the bounty hunters' telegraphed tricks

**Kind:** wire · **Lane:** THE FIGHT · **Routing:** open
**Seam tags:** seam: swarmMode.js, seam: hunterTricks.js, seam: survivalWave.js
**Write-set:** `src/data/swarmMode.js`, `src/data/hunterTricks.js`, `src/systems/survivalWave.js`, `test/fb-hunter-tricks-champions.test.mjs`

## The gap
`HUNTER_TRICKS` authors ten telegraphed gimmicks with counter windows and real verb events, consumed only by
`bountyHunt.js`. None reaches the Crucible. `SWARM_BOSS_ROTATION`'s four champions are compositions with a
room note and no trick.

## Why this direction
Authoring champion gimmicks from scratch was rejected; ten exist with telegraphs. Keying
`hunterTrickForContract` on the champion id gives each rotation a readable, counterable trick.

## Mechanism
- Add a `trickId` per champion row in `swarmMode.js` and resolve it via `hunterTrickForContract` when
  `survivalWave.js` materializes the champion.
- Run the trick's telegraph and counter window through the same path `bountyHunt.js` uses
  (`startHunterTrickTelegraph`), so the counter verbs are identical.
- Pin that each champion presents a telegraph and honours its counter window on seed 4242.

## Done when
`test/fb-hunter-tricks-champions.test.mjs`: four champions, four tricks, counter window respected;
`pq-133-04-r4-boss.test.mjs` stays green.

## Do not
Do not invent new tricks. Do not remove the counter window. Do not scale HP.

## Focus test starting points
- `test/pq-133-04-r4-boss.test.mjs`
- Locate bounty-hunt suites with `rg hunterTrick test/`.
