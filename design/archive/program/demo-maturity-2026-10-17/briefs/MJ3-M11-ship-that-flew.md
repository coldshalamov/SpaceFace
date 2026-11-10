# Task MJ3 — board row 351: M11 "The ship that flew this before" (per-hull history)

Read first: `_constraints-codex.md`, brief `design/finish-expansion-2026-09/missions/M11.md`, and
the disposition row for M11 in `design/program/admit-sfq-m/DISPOSITIONS.md`.

## The residual

The `preserved_cockpit` place exists (`src/data/alienEcology.js`, `src/data/authoredPlaces.js`).
The brief's hook — a wreck that is a ship **the player actually lost** — needs a persistent
per-hull history from `worldRecords`/save, owned by integration. Build the minimal honest
version: when the player loses a hull, its identity (name, class, sector of loss) persists in the
world records; a later route-echo/preserved-cockpit site can be authored to BE that hull (observe,
follow, align, recover verbs per the brief), and the site's readout names the ship and the loss.
Save round-trip must preserve the history; a fresh profile without losses never sees the hook.
Additive save shape only (migrations add defaults; never wipe).

## Done when

- `test/m11-ship-that-flew-before.test.mjs` on seed 4242 pins: a recorded loss creates the
  recognizable site hook; two different loss histories produce two different site readouts;
  save → reload keeps the history; no-loss profiles never see it.
