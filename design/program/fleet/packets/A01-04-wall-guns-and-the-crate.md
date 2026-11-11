# A01-04 — Buy on the floor: wall guns and the Crate (the Foundry first)

**Lane 2.** **Design:** `design/game/12_SWARM_THE_PIT.md` "What is on the floor"; `15_ARENA_FLOORS.md`
§1 (Foundry: *Pulse Laser* by the south gate, *Concussion Cannon* in the NE corner); prices in
`17_THE_LADDER_AND_THE_LONG_GAME.md` §3. **Size:** large. Slice 1 = wall guns + the Crate in
`helios_core` (the Ricochet Foundry). The Forge, Taps, doors and traps are later packets.

## What the player must see
- **Two wall guns** on the Foundry floor: `wpn_pulse_laser_s` at the south gate, `wpn_concussion_cannon_s`
  in the NE corner (ids in `src/data/weapons.js`). Each is a lit pad at the wall with a label readable from
  across the room: the gun's name and **500** (in the run's scrap/purse unit).
- **The Crate:** one pad labelled **THE CRATE · 950**. Buying gives a random gun from the whole Armory
  (`state.rng`; every weapon in `src/data/weapons.js` the current hull can mount). **After three pulls it
  lifts off and settles at a different spot** (3 authored spots in the Foundry; never the same spot twice
  in a row).
- **Buying = fly through the pad** with enough in the purse. The gun replaces the player's **primary**
  weapon for the rest of the run (or fills an empty slot). Not enough money: the pad flashes red and a
  one-line toast says *Need N more*. A purchase plays an existing purchase/unlock sound.
- Pads are marked on the radar (reuse whatever marks pickups or objectives there).

## Code facts (start here)
- The run purse and how purchases are accepted or refused: `src/systems/survivalRun.js` (search `purse`,
  `The purse refused`, `offerId`). Spend through that owner — never write the purse directly.
- How the between-round armory gives a weapon today (the "Armory" screen with "Launch round N"):
  `src/ui/screens/crucible.js` and `src/systems/survivalDraft.js`. Reuse its equip path.
- Pads as world objects: a static trigger or pickup-like entity per pad (copy the spec style in
  `src/systems/swarmSupply.js`), registered for `helios_core` the way arena laws are
  (`src/data/survivalArenas.js`, `src/systems/survivalArena.js`). Labels: an existing in-world label or
  billboard (search `worldLabel\|billboard\|nameplate` in `src/render` and `src/ui`).
- Determinism: `state.rng`, `state.simTime`.

## Files you may edit
New `src/systems/swarmFloor.js`, new `src/data/swarmFloor.js` (pad spots per arena), the registration
rows for `helios_core`, the purse/equip seam files (smallest change; name them), one render or UI file for
labels, new `test/swarm-floor.test.mjs`. `git diff` first. **Coordinate:** A01-02 (freight lane) also
registers into `helios_core`; if its commit is in, add beside it rather than restructuring.

## Checks
- `node --test test/swarm-floor.test.mjs`: 500 buys the wall gun and takes 500; 499 refuses with the
  toast; the Crate gives a catalogue weapon and moves after the third pull to a different spot; same
  seed → same results.
- `node --test test/swarm*.test.mjs test/survival*.test.mjs` — only the 30 known reds may fail.
- Look (through the lock): `node scripts/fleet/game-lock.mjs run -- npm run player-truth -- --mode=swarm --start-round=3 --rounds=1 --out=.devshots/fleet/floor`
  and say whether pads and labels are visible on the contact sheet.

Commit: `fleet(A01-04): wall guns and the Crate on the Foundry floor`.
