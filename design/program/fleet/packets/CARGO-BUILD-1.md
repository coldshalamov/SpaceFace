# CARGO-BUILD-1 — the hold becomes slots that stack to 20

**For:** a careful engineer. **Kind:** simulation and save change. **One commit per part.** The
screen comes after, from a designer (`CARGO-BAG-UI`); this is the model under it.

## Why

The owner (2026-11-20): "in most games you have a popup hull or gear bag where packs of 20 items
stack and then take a new slot, that's a good way of managing stuff in the hull and then click and
dragging it off out of the bag drops it to free up space." Ruling R22 in
`design/overhaul/00_RULINGS.md`; design in `design/overhaul/06_PROGRESSION_AND_ECONOMY.md` §5.5.

An audit mapped today's hold: **read all of `.devshots/director/fable/cargo/AUDIT.md` first.**
Today cargo is a map of commodity id to count, capped by volume, with 60-odd callers computing
`floor(free / volPerU)`. The audit's "Proposed slot model" is the plan, with these decisions from
the director where it offered a choice:

- **Stack sizes are three plain numbers.** Ordinary goods stack to **20**. Bulky goods (volume per
  unit above 1.2: gases, ice and the like) stack to **10** and are labelled "Bulky". Things that
  never stack take a slot each: persistent story items, a live specimen, a named pod or vault.
  Add the column to the commodity data; do not derive odd sizes like 8 or 13.
- **Slots from the hull.** `slots = cargoCap / 20`, rounded to a whole row of four, minimum 8,
  maximum 96. Cargo modules that add capacity add slots through the same derivation.
- **Slots are the only cap.** Volume and mass stay as computed readouts (handling, customs, HUD).
- **One bag, three sections**: cargo, gear (unfitted guns and modules, one per slot) and salvage,
  owned by the one cargo system. Gear and salvage keep their existing rules; they join the same
  state shape so one screen can show all three.
- **Nothing is lost on migration.** Old saves pack into stacks; anything beyond the slot count
  stays aboard flagged over capacity (the existing over-cap law) and blocks new pickups until the
  player sells or drops it.

## Build

**Part A — the model.** `src/systems/cargo.js` owns a slot list. `addCargo` / `removeCargo` admit
by slots (fill existing partial stacks first, then empty slots). Export one helper,
`slotFitFor(state, commodityId)` (how many more units fit), and move every caller that computes
free space from volume onto it (the audit's section 6 lists them: economy, mission terms,
missions, mining, drill, automation, contracts, reservations, drones). Keep event names where
listeners exist; add `ship:slotsChanged`.

**Part B — moving stacks.** Intents the screen will send, handled by the cargo owner and safe to
call from keyboard, controller and touch: split a stack, merge two stacks, move a stack to another
slot, sort the bag, and **jettison a stack or part of one**. Jettison spawns a real crate in space
beside the ship carrying exactly that stack (use the existing loose-cargo entity and pickup rule
the audit's section 5 found; if jettison exists, extend it to take a slot and a quantity). The
crate drifts with the ship's velocity plus a small push, can be picked up again, roped with the
Line, and taken by others. Sealed contract freight asks for confirmation data (the screen will
show it) and tells the contract owner.

**Part C — save.** Bump the save version; migration packs old `items` into slots as above;
serialise slots; fixture test from a real older save (there are fixtures under
`test/fixtures/saves/`).

**Part D — the existing screens keep working.** The current bag panel and the station market read
the new model without a redesign: they may list stacks instead of totals. Do not restyle them.

**Part E — numbers.** Run the existing economy and balance harnesses the audit names and report
what moved because bulky goods now stack to 10 instead of by exact volume. Do not retune prices;
list what the director should look at.

## Prove

- Unit tests: stacking to 20 and 10; never-stack items; fill order; split, merge, move, sort;
  jettison creates a crate with the right contents and the stack is gone; pickup restores it;
  over-capacity after migration blocks pickups and clears when sold; slot count per hull and with
  a cargo module; `slotFitFor` agrees with what `addCargo` accepts.
- The tests the audit lists as volume-exact are rewritten to the slot rule.
- `npm run check:sim`: the hold's shape changes, so re-record the golden in the same commit if it
  moves, and say so.
- `node scripts/fleet/game-lock.mjs run -- npm run check:playable`.
- In the receipt: slot counts for every hull, the list of callers moved, what the harnesses showed.

## Files

`src/systems/cargo.js`, `src/systems/ships.js` (slot derivation), `src/data/commodities.js`,
`src/save/*`, the callers in the audit's section 6, the minimum of `src/ui/hud.js` and
`src/ui/station/screens/market.js` needed for Part D, tests, fixtures. Shared files: use
`bash scripts/fleet/own-commit.sh begin <file>` before editing and
`bash scripts/fleet/own-commit.sh commit "<message>" <files>`. The price model in
`src/systems/economy.js` was just rebuilt by ECON-BUILD-1: read its receipt and build on it.
