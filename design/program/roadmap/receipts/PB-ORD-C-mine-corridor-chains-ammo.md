# PB-ORD-C — SF-041+042+043 mine corridor authoring + deterministic bomb chains + authored ammo route (build_map.md §1C row 95)

**Lane:** ordnance (pb-ten-lanes) · **Status:** implemented, focused checks green · **Date:** 2026-09-29
**Packets:** `design/planbank/SpaceFace_Planbank_300/plans/03-ordnance/SF-041…SF-043` (deepening trio, one identical write-set — built as one coherent batch per the row rule)
**Sitting note:** an interrupted prior sitting left the production mechanism and the counterexample file in the working tree, uncommitted, with **7 of 11 tests red** (never verified). This sitting reconstructed the outcome: verified every production hunk against the packets, repaired the seven broken test scenarios (all were scenario/fixture bugs — the production laws were sound), and proved the batch green.

## The gap in player terms (preflight)

- **SF-041:** the minefield wake (encounter 325, jackal + PD escort on your cargo lane) seeded an old staggered ±28 wu fence — no readable safe lane, and a placed mine was invisible to blast forces AND field forces, so "shove the fence out of my way" was not a real solution.
- **SF-042:** a bomb blast could not reach other drift ordnance at all — no sympathetic chain, so multi-bomb consequences were unbounded fiction rather than deterministic drama.
- **SF-043:** the rack economy (buy → fit → drop → depleted advance) had no route that made the loadout decision matter, and its refusal/reconciliation laws were untested at the commit boundary.

## What exists now (mechanism through existing owners; prior sitting's hunks, verified this sitting)

1. **Corridor law on the mines owner** — `src/systems/mines.js` `mineCorridorLayout(fromPos, toPos)`: pure endpoint geometry (no rng), a fence of 3 hulls hugging ONE flank (56 wu first lateral — the 55 wu trigger disc just kisses the approach centreline — then +46 wu per hull, overlapping into a wall). The opposite flank is an open, readable safe lane. The wake seed (`src/systems/encounterScripts.js` `seedMinefieldWake`) now lays its mines through this law; the encounter (325 `minefield_wake`, gated `minCargoValue: 180` — the valuable fragile load is your own cargo, pay/refuse/run choices) is the authored route with a displacement problem, a dangerous formation, and multiple solutions.
2. **Displacement is physical** — `src/systems/bombs.js` puts `mine` in the movable loose family (`LOOSE_TYPES`, `BOMB_TARGET_BUCKETS` + `mines` bucket; the bucket exists in `coreSystem.appendEntityIndex`), so a blast SHOVES a placed mine (real impulse through `helpers.combatPhysics`) but never arms, triggers, or damages it. `src/systems/fields.js` puts `mine` in the field loose family (`FIELD_LOOSE_TYPES`, `index.mines` in the candidate lists), so Repulsor/Well cones move the fence too. Owner/arm/trigger eligibility ride the entity's own data, so displaced mines stay live, owned terrain (`mines.js` `_findTriggerVictim` keeps the owner/team skip law).
3. **Deterministic chains** — `src/systems/bombs.js` `_blastVictims` gives armed, still-drifting ordnance in reach a sympathetic `_prime(e, 'chain', …, originId)`: resolution rides the ordinary warning phase on a LATER tick (never same-tick recursion), each bomb can be primed exactly once (its phase leaves `drift`), the walk follows the id-sorted `_active` order, the world cap bounds the population, unarmed capsules are skipped (`armedAt = now + BOMB_DRIFT.armS` arming law preserved). `chainFrom` (immediate cause) propagates through `bombs:primed`/`bombs:detonated` while `ownerId` stays the original dropper — damage bills its own owner across the chain.
4. **Ammo route accounting** — the existing rack owner (`state.bombs`: buy at `price × units` into stock, fit moves units out of the hangar, dry-rack refusal buys no cooldown and moves no selection, depleted advance is announced via `bombs:cycle` and selects the next loaded socket) now bound by counterexamples at the commit boundary.

`src/core/fields/fieldKernel.js`, `src/render/bombPresentation.js`, `src/systems/weapons.js`, `src/data/bombs.js` were read as packet seams and needed no change.

## Counterexample tests (`test/pb-ord-c-mine-corridor-chains-ammo.test.mjs`, 11 — all would fail under the old behavior)

- Chain: one command blast primes a spawned-OUT-of-id-order enemy ring in stable id order `[7,8,9]`, each exactly once, `trigger 'chain'` + `chainFrom` naming the origin, each detonation keeping its ORIGINAL (enemy) owner; the same seed replays byte-identically (deepEqual over events + owner-attributed damage); an unarmed capsule at chain reach is never cooked off, a payload destroyed before arming never reaches a terminal transition, and only the armed origin detonates.
- Corridor: pure geometry — same flank, first disc kisses the centreline, no trigger disc crosses it (the lane threads at zero ordnance cost), overlapping into a wall; a blast shoves the placed mine (old: nothing) without arming/triggering/damaging it; a displaced mine keeps owner, fuse and eligibility and trips on a third-party escort with the original owner attribution; the field candidate set collects placed mines; the wake seed provably consumes the corridor law and the old staggered wall is gone.
- Ammo: a dry rack refuses without consuming cooldown or moving the selection; buy/fit/drop/depleted-advance reconcile exactly (price × units, fit never duplicates, exactly the loaded frag units leave the bay, the advance is announced, drops cost no credits); two mixes solve the same corridor — one concussion drum at the fence centroid displaces every hull (displaced, not spent), or thread the open flank at zero cost.

## Repairs this sitting (all in the test file; no production change needed)

1. `spawnBomb` fixture dropped its `id` argument (entities got auto-ids 50+) — ids are now honoured, and the chain ring spawns out of id order so the order assertion proves id-sorting, not spawn luck.
2. Ring bombs were player-owned; `commandDetonate` is owner-scoped and walks the whole list (`bombs.js:608`), so the command primed all four. Ring is now enemy-owned; chain-prime assertions filter `trigger === 'chain'`.
3. The fixture gave unarmed bombs `armedAt: now`, so command detonation primed them; now `armedAt = now + BOMB_DRIFT.armS`, matching the drop law (`bombs.js:568-569`).
4. The unarmed-capsule scenario sat at exactly the contact threshold (50 wu) it crosses when its arm clock expires mid-test — moved to 70 wu (still inside the 96 wu chain reach); added the "destroyed before arming" acceptance case.
5. The blast-shove mine was seeded 30 wu from the player — inside the 55 wu trigger ring, so it tripped on the player before the blast. Seeded at 80 wu (outside every ring, inside the 96 wu frag radius).
6. The displaced-mine scenario used a same-team escort (mines never trip on their own team) and seeded the mine on the player's position — escort is now a third party, seed 150 wu out, then displaced next to it.
7. The rack loop counted total drops: the magazine+1-th press legitimately releases the payload the depleted advance selected; it now counts frag units only.
8. Mix A seeded the concussion drum 166–250 wu from two of three fence hulls (out of its 130 wu radius); it now seeds at the fence centroid.

## Checks (all run this sitting, real exit codes)

| Command | Result |
|---|---|
| `node --test test/pb-ord-c-mine-corridor-chains-ammo.test.mjs` | exit 1 → repairs → **exit 0, 11/11 pass** (re-verified after final edits and again after other lanes moved HEAD) |
| `node --test test/mine-layer.test.mjs test/seam-mines.test.mjs test/minefield-wake-choice.test.mjs test/chain-reaction.test.mjs test/chain-reaction-determinism.test.mjs` | exit 0 — 31/31 pass |
| `node --test test/bombs.test.mjs test/bomb-presentation.test.mjs test/bomb-rack-economy.test.mjs test/inf-096-bomb-target-index.test.mjs` | exit 0 — 29/29 pass (SF-042/043 packet starting points) |
| `node --test test/fields-predictor.test.mjs test/inf-042-field-lifecycle.test.mjs test/gravity-mark.test.mjs test/fields-kernel.test.mjs` | exit 1 — 29/30; the one failure (`projectFieldTrajectory matches the actual simulated body path under a Well`, travelled 5.23 wu < 8) **fails identically at clean HEAD** — verified in a throwaway `git worktree` at `08b166d9b` (exit 1, same test, then removed). Pre-existing master defect in the Well/Rapier coupling, NOT introduced by this row (this row's fields hunks only add `mine` to the loose candidate family; the failing body is a `wreck`, collected identically before and after). Cause unknown without digging into the active fields-perf seam — reported, not patched. |

## Not proven here

- Ordinary-route play (equip → encounter 325 on a trade lane → thread/displace/pay → chain a second bomb into the fence): not exercised in this environment; the corridor law is node-proven and the wake seed is wired through it, but the played result is **route-unproven**.
- The Well-predictor failure above is the one open defect seen this sitting; it is foreign to this row and predates it.

## Files

- `src/systems/mines.js` (corridor law) · `src/systems/bombs.js` (mine family + chain law) · `src/systems/fields.js` (mine in the field loose family) · `src/systems/encounterScripts.js` (wake seed through the corridor law; file also carries another row's long-chord hunks — disjoint)
- `test/pb-ord-c-mine-corridor-chains-ammo.test.mjs` (authored prior sitting; 8 scenario repairs this sitting)
