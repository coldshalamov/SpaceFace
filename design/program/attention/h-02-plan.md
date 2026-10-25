# H-02 plan — synthesized (tribunal)

| Axis | Drifter | Archivist | Accountant |
|------|---------|-----------|------------|
| Critical-path | 5 | 4 | — |
| Authenticity | 5 | 5 | 5 (schema-faithful) |
| Specificity | 4 | 4 | 5 |
| Cost | 5 | 5 | 5 |
| Non-redundancy | 4 | 4 | 5 |

## Landed plan
1. `src/data/barks.js` `HISTORY_RECOGNITION` — one third `kills` line appended to each of the
   eight live factions (scn, mts, dmc, reach, quiet, free, vael, choir), each counting the
   dead in that house's own register.
2. `src/data/barks.js` `FRONTIER_FIRST_NAMES` +8, `FRONTIER_LAST_NAMES` +8 — grounded spacer
   names plus a couple of callsign-flavored singles (never the canon figures' names).
3. `src/data/barks.js` `PASSENGER_WHY_LINES` +4, `PASSENGER_BEATS` +2 per beat
   (board/midrun/arrive) — owner voices with lives.

## Rejected
- `enemies.js` livery/markings (foreign-dirty file), stencil-id decals (new machinery),
  per-hull variant stat flavor (needs consumer fields).

## Approvals
- Author: implementer. Drafts in h-02-drafts.md.
