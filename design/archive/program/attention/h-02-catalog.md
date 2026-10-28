# H-02 catalog — NPC hulls on traffic (wasp/helios/ashline variants)

## What the player literally perceives
- Traffic hulls carry faction liveries via `enemies.js` (foreign-dirty — avoided) and paint
  identity; what the player HEARS about them comes through `src/data/barks.js`.
- `HULL_RECOGNITION` (barks.js:955): 14 factions × 4 lines — NPCs naming the player's hull,
  some already tally-adjacent ("The Reach counts, friend").
- `HISTORY_RECOGNITION` (barks.js:1067): per-faction `kills`/`hunts`/`fears`/`offers_work`
  cells, exactly 2 lines each — the "kill tallies and named captains" surface. Thin: two
  variants means the same line repeats inside one fight.
- `FRONTIER_FIRST_NAMES`/`FRONTIER_LAST_NAMES` (barks.js:2657): 40/28 generic pilot names.
- `PASSENGER_WHY_LINES`/`PASSENGER_BEATS` (barks.js:2666+): owner voices with lives — 10 why
  lines, ~8 board, midrun, arrive beats. Closest thing to "owner names with stories".
- `HULL_NAME_BANK` (hullIdentity.js): the player's own hull names — H-01 extended it.
- `src/data/enemies.js`: NPC variant defs — 6+/2- foreign diff; variant stat markings are
  foreign hunks, so this row lands entirely on the barks/name seam instead.

## What is thin
- HISTORY_RECOGNITION cells are 2 deep — kill-tally lines stutter within a single engagement.
- The name banks are serviceable but short; traffic repetition makes NPC hulls feel cloned.
- Passenger voices are strong but few; more owner-flavor costs nothing.

## Tone register
Faction voices are fixed law (barks.js header). Concord cites refs, Meridian prices, Drift
counts shifts, Reach weighs, Quiet says nothing, Choir sings, Free is plain, Vael clauses.

## Additive seams (clean)
- `HISTORY_RECOGNITION[faction].kills` — third tally line per live faction.
- `FRONTIER_FIRST_NAMES` / `FRONTIER_LAST_NAMES` — append grounded names.
- `PASSENGER_WHY_LINES`, `PASSENGER_BEATS.board/midrun/arrive` — append beats.
