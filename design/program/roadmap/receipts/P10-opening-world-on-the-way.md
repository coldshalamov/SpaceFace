# P10 — the world on the way, at the opening (build_map §1C row 59)

Row: **59 · P10 · "World-on-the-way remainder: working chain within two screen-depths + raid in progress — partial" · BUILD**.
Source sentence: `design/program/DEMO_WORK_LIST_2026-09-23.md` P10 / `build_map.md` §25 Phase 6 —
"the opening neighbourhood shows one working chain within two screen-depths; the first raid is
already happening" — measured against §22 A1's authored unit: two screen-depths = 230 WU
(encounter 344 authors `fireWithinWu: 230` as "~2 screen-depths (115 WU each)",
`src/data/encounters/344-opening-hauler-raid.js:26-29`).

## The gap, in player terms (measured before the change)

On a fresh run you wake at the sector origin of Helios Prime (`src/main.js:432-454` spawns the
player and boots `world.enterSector`; `src/systems/world.js:3470-3484` places a first spawn at the
sector origin). A probe on the production route (seed 4242, boot-style enter, world + traffic +
npcJobsRuntime + encounterDirector) measured the authored Helios chain:

| body | distance from opening position |
|---|---|
| helios_customs_patrol | 655 WU (5.7 screen-depths) |
| helios_freight_hauler | 698 WU (6.1) |
| helios_seam_fence | 721 WU (6.3) |
| helios_seam_miner | 801 WU (7.0) |

Nothing in your first two screen-depths was working. The raid half was already satisfied: the same
probe, with **no injected pending**, showed the day-0 plan carrying `opening_hauler_raid` and the
raid firing organically at **t=125 s**, phase `conflict`, hauler at 230 WU with raiders committed
to it. So the row's "partial" resolved to one missing half: the working chain inside two
screen-depths.

## What changed

`src/data/sectorActivityPockets.js` — the Freight Leg pocket (the chain's movement half:
freight hauler, staging pod, customs patrol) re-anchors from the claim mark
(`poi_helios_claim_mark`, 636,-214 — 671 WU out) to the freight-spine tally
(`poi_helios_tally`, 120,180 — 216 WU out, inside `zone_helios_freight`, which is the leg's own
fiction rather than a claim-margin borrow). The hauler spawn and staging pod move to the
origin side of the anchor; the patrol's quarter-arc beat re-fictions from "claim perimeter"
to the arrival-end spine beat (same mark offsets, so route-topology classes are unchanged).
The seam pocket (miner + fence — the work) stays on the Sanctioned Claim where the ore is.
One corridor strings the chain: spawn → tally leg → claim mark → seam — the world on the way.

Everything is anchor-relative through the existing owners (spawns: `traffic.js:2166-2170`;
job routes: `traffic.js:1050-1092`), so the move is a data change with zero per-tick code
altered. Band laws are intact: spawns/objects within the 95 WU immediate band, marks in the
95–125 WU moving band, exactly two actors per pocket, distinct topology classes.

## Numbers after (production route, seed 4242)

| body | distance from opening position |
|---|---|
| helios_customs_patrol | 176 WU (1.5 screen-depths) |
| helios_freight_hauler | 186 WU (1.6) |
| helios_freight_staging_pod (descriptor) | 205 WU (1.8) |
| helios_seam_fence (unchanged) | 721 WU — the work, at the claim |
| helios_seam_miner (unchanged) | 801 WU — the work, at the claim |

Raid (unchanged behaviour, now pinned on the organic route): fires ≤180 s, hauler under
attack at the authored 230 WU reach, every raider committed to the hauler.

## Files

- `src/data/sectorActivityPockets.js` — Freight Leg re-anchor + offsets + beat re-fiction (only production file touched).
- `test/p10-opening-world-on-the-way.test.mjs` — NEW focused test (counterexample + organic raid pin).
- `test/helios-activity-pocket-chain.test.mjs` — the "one neighbourhood ≤125 WU" assertion replaced by the opening-corridor law (leg bodies ≤230 WU of the opening, seam on the claim, leg nearer than seam); patrol prose updated.

## Counterexample proof

With the old anchor and old hauler offset temporarily restored, the data-law test fails at the
two-screen-depths assertion (`ERR_ASSERTION` at `test/p10-opening-world-on-the-way.test.mjs:90`);
restored, it passes. Old behaviour: no chain body within 230 WU → both route assertions fail.

## Checks run (real exit codes)

| command | exit | result |
|---|---|---|
| `node --test test/p10-opening-world-on-the-way.test.mjs test/helios-activity-pocket-chain.test.mjs test/verb-02-opening-raid-already-live.test.mjs` | 0 | 11/11 pass |
| `node --test test/ceres-activity-traffic-cast.test.mjs test/ceres-activity-faction-tender.test.mjs test/ceres-activity-runtime-lifecycle.test.mjs test/demo-opening-runtime-contract.test.mjs test/npc-jobs-working-trades.test.mjs` | 0 | 72/72 pass |
| `node --test test/civilian-traffic-behavior-variety.test.mjs` | 0 | 9/9 pass (run alone; fails at 4.3 ms/tick vs 2.5 budget only when run on the ten-lane-loaded box — wall-clock noise, no per-tick code changed) |
| `node --test test/ceres-active-pockets.test.mjs` | 1 | 10/11 — `R5B materializes six inert object slots…` fails on `opticCells: 0` vs expected 42; reproduced with the pristine HEAD content of `sectorActivityPockets.js` overlaid → pre-existing, foreign cause (optic/collider ground; `src/systems/asteroidSites.js` is dirty with another lane's work) |
| `node --test test/ceres-activity-ambush-director.test.mjs` | 1 | 5/7 — the two Ceres crossing tests fail; reproduced identically with the pristine HEAD content of `sectorActivityPockets.js` → pre-existing, foreign cause (`src/systems/ambushSignatures.js`, `asteroidSites.js`, `scanner.js` are dirty with other lanes' work) |

Not run: `check:baseline`, `check-ci-report` (the workflow gates on those after this row), broad
`check:all`. `verb-02` is reported as what it is: the shape-contract test with injected pending;
the organic fire is pinned by the new P10 test.

## Determinism

All positions are authored data (no RNG). The tests use seed 4242, `state.simTime` pacing, and the
production `enterSector` path; no wall time, no ambient randomness.
