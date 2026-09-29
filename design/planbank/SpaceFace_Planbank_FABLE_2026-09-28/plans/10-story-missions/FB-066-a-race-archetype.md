# FB-066 — A race mission: a timed course through real lane and field geometry

**Kind:** build · **Lane:** THE LONG GAME · **Routing:** open
**Seam tags:** seam: missions.js, seam: missionConditions.js, seam: travelLaneRoutes.js
**Write-set:** `src/data/missions.js`, `src/systems/missions.js`, `src/data/missionConditions.js`, `test/fb-race-archetype.test.mjs`

## The gap
Seventeen `MISSION_TYPES` cover escort, rescue, recover, investigate, heist and defend; there is no race or
pursuit-course archetype anywhere. The mature-parity list names it and the game's physical agency makes it
natural: a course is lane geometry, field rings and a slingshot anchor.

## Why this direction
A checkpoint minigame was rejected (no collection of minigames). A race is a mission with physics conditions
(pass these gates in order under a time) using `missionConditions.js` terms, offered by scenic and lane
sectors, with a ghost from the run-share tape as the rival.

## Mechanism
- Add a `race` type with gates authored as ordered positional terms along an existing lane or through a field
  ring set; time and order scored by the condition evaluator.
- Offer from stations in sectors with a lane or `scenic` flag; pay by time band; a razor-band time posts a news
  line.
- Pin a seed-4242 course: gate order enforced, time scored, no pay on a skipped gate.

## Done when
`test/fb-race-archetype.test.mjs`: order enforced, three time bands, one news line on the best band;
`pq-152-01-set-pieces.test.mjs` stays green.

## Do not
Do not add a race screen or a leaderboard service. Do not clamp speed. Do not spawn traffic to block the
course.

## Focus test starting points
- `test/pq-152-01-set-pieces.test.mjs`
- `test/travel-lanes.test.mjs`
