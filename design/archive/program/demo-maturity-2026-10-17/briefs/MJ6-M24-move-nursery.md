# Task MJ6 — board row 355: M24 "Move the nursery, not the animals" (ecology relocation)

Read first: `_constraints-codex.md`, brief `design/finish-expansion-2026-09/missions/M24.md`, and
the disposition row in `design/program/admit-sfq-m/DISPOSITIONS.md`.

## The residual

Relocation of a living site is ecology state in `src/systems/alienEcology.js`
(`test/veil-ray-nursery.test.mjs` is the live nursery fixture). The brief: observe, lure,
divert, protect — the nursery's substrate can be moved without moving the animals; the animals
re-home onto it if the move is gentle and staged, and scatter (a real, persisted consequence) if
it is not. Do not retune ecology balances; add the relocation operation through the existing
ecology writer.

## Done when

- `test/m24-move-the-nursery.test.mjs` on seed 4242 pins: staged gentle move re-homes the
  animals onto the relocated substrate; a violent move scatters them (persisted); save/reload
  keeps the new site state.
