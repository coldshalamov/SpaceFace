# X-07 audit — mining payoff surface

Row: build_map §1P 565. Catalog agent ba3b5ac3, recorded by devin-lanea 2026-10-24.

## The dossier is stale — most of the ask already shipped

- Seams: `deriveAsteroidSeams` (`data/mining.js:44-64`), 1–4 per rock; aim within `SEAM_HIT_RADIUS=14`
  (`systems/mining.js:161,2885-2897`). Off-seam pays 35 % yield at 70 % speed (`:168-169`) — aim is worth ~3× income.
- Vent rhythm: amber band ≥0.62 (`:191,869`); releasing inside it pays up to +75 % of a pulse as bonus ore
  (`:899-944`). Rich seams/cores (`:82-89,1130-1170`).
- Surfacing: ON/OFF SEAM word (`ui/miningHud.js:114-115,402-408`), seam chime, "VENT READY" alert, "+N Ore" float.

## Missing

- **Overheat costs nothing.** The peg lockout was removed by owner ruling (`mining.js:194-198,841-842`); a pegged
  gauge clamps and keeps full extraction and full vent bonus, so the rhythm is pure upside with no discipline.
- A deep, well-timed vent is not named — "clean cut" goes unremarked.

## Approvals

- audit-gate reviewer 27464a4d — APPROVE (2026-10-24)
- audit-gate reviewer 98e62e20 — APPROVE (2026-10-24)
- audit-gate reviewer 03b56769 — APPROVE (2026-10-24) — audit✓3
