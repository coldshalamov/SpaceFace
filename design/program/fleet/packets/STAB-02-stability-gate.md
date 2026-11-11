# STAB-02 — One command that says "the game still works"

**Owner complaint (2026-11-10):** "we keep developing on it and it breaks and regresses constantly."
**Size:** medium. **Tier:** D.

## What to build
`npm run gate` runs `node scripts/fleet/gate.mjs`. It runs, in order, stopping at the first failure:
1. `npm run check:playable` (boots Adventure through the real route; asserts menu, launch, ship,
   world, controls, no uncaught exception, no shader error);
2. a **Swarm boot**: `npm run player-truth -- --mode=swarm --rounds=1` (read
   `scripts/player-truth/run.mjs` for flags; use the headless default);
3. `npm run check:sim` (the deterministic 47-A replay).

It prints one line per step (`PASS boot-adventure 74s` / `FAIL boot-swarm: <first error line>`),
then `GATE PASS` or `GATE FAIL`, writes the same to `.devshots/fleet/gate-last.txt`, and exits 0/1.
`--quick` runs step 1 only. Report each step's wall time; the whole gate should stay under 12 minutes.

## Then document it
- In `design/program/fleet/README.md` add a section "The gate": the lead runs `npm run gate` after
  every batch of fleet commits and before any push; a red gate means the batch is fixed or reverted
  before anything else lands.
- One line in `scripts/AGENTS.md` naming the command.

## Files you may edit
`scripts/fleet/gate.mjs` (new), `package.json` (one script line only — `git diff` first),
`design/program/fleet/README.md`, `scripts/AGENTS.md`.

## Checks
Run `npm run gate` once and paste its output. If a step fails on current master, that is a finding,
not your bug: report which step and the first error, and still commit the gate.

Commit: `fleet(STAB-02): npm run gate says whether the game still works`.
