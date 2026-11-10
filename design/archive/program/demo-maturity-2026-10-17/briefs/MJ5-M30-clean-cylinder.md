# Task MJ5 — board row 354: M30 "The clean cylinder" (escort runtime)

Read first: `_constraints-codex.md`, brief `design/finish-expansion-2026-09/missions/M30.md`, and
the disposition row in `design/program/admit-sfq-m/DISPOSITIONS.md`.

## The residual

Escort with current suppression support (`suppression` in `src/data/alienEcology.js` /
`src/data/precursorMachines.js`); the missing piece is escort runtime in
`src/systems/missions.js`: match, escort, repair, retreat — a Shepherd-class charge crossing a
contaminated corridor, the player keeping its exposure clean (match its lane, repair it when
fouled, retreat with it when suppression spikes), with a real failure state (fouled charge →
contaminated delivery, not instant loss).

## Done when

- `test/m30-clean-cylinder.test.mjs` on seed 4242 pins: escort offer from an ordinary surface;
  clean-arrival vs fouled-arrival outcomes; a repair mid-route restores the charge; retreat
  completes with a reduced-but-honest result; save/reload mid-escort resumes.
