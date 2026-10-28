# H-02 drafts — three personas

## The Drifter (working-class regular)
NPC hulls should feel flown by people with jobs and grudges, not wave spawns. Draft: deepen
`HISTORY_RECOGNITION.kills` — a third tally line per live faction where the voice counts the
dead the way that house counts (Concord files them, Drift whistles for them, Reach weighs
them). Plus names that sound like spacers, not space-opera: short, worn, surname-first
("Okafor", "Bly", "Reyes", "Tallis").

## The Archivist (continuity and memory)
Traffic is memory: a hull that fought you should carry the fight in how it hails you later.
Draft: kill-tally lines that reference the count itself ({kills} token) plus names that echo
existing figures' naming pattern (one-word callsign-adjacent surnames — Vane, Vols, Kell
register, never the actual figures).

## The Accountant (systems reality-check)
Every proposal names its schema and cost: (a) `HISTORY_RECOGNITION` cell appends — selector
already picks by rng modulo cell length, appends are free and save-safe; (b) name-bank appends —
deterministic hash picks, appended names only appear on new NPCs; (c) `PASSENGER_BEATS`
appends — three-beat structure must be preserved (board/midrun/arrive), no new beat kinds;
(d) rejected: `enemies.js` variant markings (foreign-dirty), new paint/livery ids (renderer
vocabulary), kill-tally decals (needs stencil vocabulary = new machinery).

## Tribunal notes (pre-scoring)
- All three converge on the bark banks — the Accountant's schema analysis and the Drifter's
  lived-texture goal land on the same cells.
- Divergence to preserve: Drifter wants workaday names; Archivist wants echoes of the cast.
  Splice: half grounded surnames, half callsign-flavored singles.
