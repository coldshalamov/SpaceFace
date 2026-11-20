# CARGO-AUDIT — how the hold works today, so it can become a bag of slots

**For:** a careful reader of code. **Kind:** read-only audit, small. **No source edits. No commit.**
You have about 25 minutes: write the report file early and keep adding to it.

## Why

Ruling R22 in `design/overhaul/00_RULINGS.md` (read it): the hold becomes a grid of slots, like
items stack to 20 and then take a new slot, the bag opens with one key in flight, and dragging a
stack out of the bag drops it into space as a real crate. One cargo owner, not a second inventory
bolted on. This audit maps what exists.

## Find, with file and line

1. **The owner of cargo state.** Where the player's cargo lives in `GameState`, its exact shape
   (ids, quantities, volume, mass, custody, tags), who writes it, and how capacity is computed per
   ship. Start at `src/systems/cargo.js`, `cargoCustody.js`, `cargoReservations.js`,
   `fragileCargo.js`, `holdfast.js`, `src/data/cargoIdentity.js`, `cargoPayloadTypes.js`,
   `commodities.js`.
2. **Gear and modules.** Where unfitted guns, modules and other gear live (a separate inventory?
   the station's storage? "spares"?), and whether they share the hold.
3. **How it is saved**, the save version, and where migrations live (`src/save/`).
4. **Every screen that shows or edits cargo**: flight HUD cargo bar, any cargo popup
   (`node scripts/ui-bench.mjs --list` names `popup-cargo`), station market, storage, shipworks,
   contracts; file for each.
5. **Dropping and picking up.** Does jettison exist? How do loose crates, loot and salvage exist in
   the world today (entity kinds, pickup rule, the Line/rope interaction)? What event would the bag
   send to drop a stack as a crate?
6. **What assumes "cargo is volume, not slots"**: missions, contracts, reservations, drones, the
   economy, tests. List the callers that read capacity or free space.

## Report

Write `.devshots/director/fable/cargo/AUDIT.md` (create the folder): the six sections above as
short tables, then **a proposed slot model**: how each existing cargo kind maps to stacks of 20
(what counts as "like items"; what never stacks, for example a named pod or a live animal), how
ship hold size maps to a slot count, what happens to cargo that no longer fits after migration, and
the smallest set of files to change. Your receipt is a pointer to the report plus the three most
important findings in plain words.
