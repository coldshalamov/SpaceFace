# Q5 diagnosis — tests that protect the game

**Owner direction:** three tiers — fast (< 2 min, behaviour), route (real boot/input), reference
(determinism, versioned by a tool) — and the source-text pin habit removed.

## Player-visible problem

A red test could be made green by editing a hash or a regex, so the suite did not answer "can the
player still fight, dock, trade, save and continue?". There was no measured fast tier at all:
5,424 `test/*.test.mjs` files and 779 npm scripts, with `npm run check` expanding 400 commands and
still not being the thing an agent runs before touching flight, save or the station screen.

## Measured cause chain

- Running the required 36-file core set as one `node --test` batch took **10 s** and returned
  **4 failures**: `swarm-bank` (1), `swarm-ladder` (1), `sector-membership-index` (2).
- S14 `483dff1723` (2026-11-06) moved the first champion from wave 10 to wave 5, then every tenth.
  `swarm-bank` still refused wave 10 as a boss wave; `swarm-ladder` still asked wave 10 for the boss
  preview. Those are stale fixtures, not product regressions.
- `sector-membership-index` scanned five newly landed writers that were absent from the guard
  allowlist, and still listed `missions.js`, which no longer restamps. Two sites (`faction_pitborn`
  line 294 `c.sectorId`, `faction_verge` line 352 `l.sectorId`) are record normalizers, not indexed
  entities; `trafficEscortOps` and `scavengerOccupationSwitch` write `data.sectorId` only after the
  canonical `homeSectorId` was stamped and synced.
- `ship-stats` was red against an **uncommitted foreign** re-anchor of the six stat ceilings in
  `src/ui/ship/shipStats.js` (firepower ceiling 130 → 2400; generalist label → All-Rounder). The test
  still pinned the old scale and the old word. The foreign diff was preserved; only the stale
  expectations moved.
- `shipworks-worker-fit` failed once in the first sequential tier run, then passed 3/3 standalone and
  in the full 39-entry rerun. Recorded as an observed flake, not silently deleted.

## Architecture question

Was the problem a missing glob, or the way tests were written? Both. A hand-maintained glob would
drift silently, and source-slice tests (`new Function` over `readFileSync` slices) would keep
breaking on refactors. The cheap road is a **validated manifest**: the tier files are the source of
truth, and the runner refuses unknown/missing entries before any test runs.

## Chosen road

1. `test/tiers/{fast,route,reference}.txt` + `scripts/test-tier.mjs` (shard/json/timeout/drift).
2. `scripts/reference.mjs` writes append-only `test/references/<id>/vN` envelopes, a gzipped
   canonical snapshot, `history.jsonl` and `index.json`; repeat-hash and event-count gates run
   before any write.
3. Behaviour replacements for the named source-slice offender (`new-game-embark-present` now uses
   the real scheduler/screen exports) plus a negative guard with a shrinking 33-file legacy ledger.
4. Four new fast guards: tier drift, station-walk coverage, reference safety, source-slice guard;
   a 120-tick two-process determinism smoke test in the reference tier.

## Verification

`npm run test:fast`: **39/39 passed in 51.7 s** (wall 52.5 s) on the owner laptop after the fixture
fixes. Route and reference tiers were validated entry-by-entry, not executed end-to-end in this
session.

## Open

- 33 legacy tests still evaluate source slices; the ledger only shrinks. Converting them needs
  module-level fixtures or route probes, one file at a time.
- `swarmZoneFor(10).bossWave` still reads 10 while the champion now arrives at wave 5. Zone stars
  settle on the wave-10 boundary, so this is a metadata/readout inconsistency, not a star bug; it
  belongs to the S14 owner.
- `trafficEscortOps`/`scavengerOccupationSwitch` are safe today because the canonical home sector is
  already set. A future path that reaches them with a null home sector must add the membership
  funnel.
- One `shipworks-worker-fit` red was observed once under the first sequential run; not reproduced.
