# FB-102 — The sim keeps the career numbers a statistics screen needs: distance flown, kills by weapon, biggest throw, time per sector

**Kind:** build · **Lane:** THE LONG GAME · **Routing:** open
**Seam tags:** seam: achievements.js, seam: gameState.js
**Write-set:** `src/systems/achievements.js`, `src/data/achievements.js`, `src/core/gameState.js`, `test/fb-statistics-counters.test.mjs`

## The gap
`player.stats` has eight fields shown in two partial places; `ACHIEVEMENT_COUNTERS` keeps thirteen lifetime
counters used only as achievement inputs. Nothing computes distance flown (no odometer), kills by weapon,
biggest throw (throws are counted, not measured), time per sector or ships lost as a tally. There is no
statistics screen; this packet is its sim half, the screen is FB-103.

## Why this direction
`ACHIEVEMENT_EVENT_HANDLERS` is the existing bus tap; extending it is smaller than a new listener set, and the
counters persist in the profile bag already.

## Mechanism
- Add taps: odometer from the player's per-tick displacement (accumulated on the near clock, not per frame),
  kills by weapon family from `combat:kill` provenance, biggest throw from `massline:throw` payload speed, time
  per sector from `sector:enter`/`sector:exit`, ships lost from the loss ledger.
- Expose a read-only `+careerStats()` accessor for the screen and the death summary.
- Pin the counters after a scripted seed-4242 session and that they survive save/export.

## Done when
`test/fb-statistics-counters.test.mjs`: five new counters populated and persisted;
`pq-033-03-achievements-ledger.test.mjs` stays green.

## Do not
Do not count per frame. Do not add achievements here. Do not display in this packet.

## Focus test starting points
- `test/pq-033-03-achievements-ledger.test.mjs`
- `test/pq-033-03-achievements-defs.test.mjs`
