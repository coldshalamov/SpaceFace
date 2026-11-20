# CARGO-BAG-UI — the bag: a grid you open in flight, drag out of to drop

**For:** a designer-builder with eyes. **Kind:** a new screen-in-flight and its station twin.
**Commit when the frames look right.** The director judges your frames. Start only after
CARGO-BUILD-1 has landed (`git log --oneline -40 | grep -i cargo`); read its receipt under
`.devshots/fleet/runs/CARGO-BUILD-1.*/RECEIPT.md` for the intents it exposes.

## Why

The owner (2026-11-20): "in most games you have a popup hull or gear bag where packs of 20 items
stack and then take a new slot… click and dragging it off out of the bag drops it to free up
space." Ruling R22 (`design/overhaul/00_RULINGS.md`). The model now exists: the hold is slots,
stacks of 20 (10 for bulky goods), three sections (cargo, gear, salvage).

## Build

1. **The bag in flight.** One key (use the key the cargo panel has today; show it on the HUD)
   opens a compact panel at the side of the screen. It does not pause a calm flight and it never
   covers the ship or the aim point. In a fight it still opens (dropping cargo to run is a real
   tactic) but stays small.
   - A grid of square slots, four across, sized for a mouse and for a thumb. Each filled slot
     shows the item's icon, its count in the corner, and a thin bar when the stack is partial.
     Bulky goods carry a small "Bulky" mark; sealed contract freight a lock; illegal goods a
     plain warning mark. Empty slots are visibly empty.
   - Three tabs: Cargo, Gear, Salvage. A header line: slots used of total, total value at the
     last market seen, total mass.
   - Hover or focus a stack: a small card with its name, count, value each and total, where it
     was bought or mined, and the best place the player knows to sell it.
2. **Drag out to drop.** Dragging a stack off the panel and releasing drops it as a crate beside
   the ship (the model's jettison intent). While dragging outside the panel the cursor shows a
   crate and the words "Drop in space"; releasing over the panel cancels. Shift-drag (or a
   right-click menu, or a long press) splits a stack and drops part. Sealed contract freight asks
   once: "Drop sealed freight? The contract will fail." Dragging onto another slot moves or
   merges. A Sort button tidies.
3. **Without a mouse.** Controller: move a cursor across slots with the stick or pad, one button
   picks up, another drops in space, another splits. Touch: tap to select, a "Drop" button
   appears. Keyboard: arrows and Enter, Delete to drop. `--walk` must reach everything.
4. **The same grid in the station.** The market, storage and shipyard screens show this same grid
   as their "your hold" side: drag a stack onto the market to sell, onto storage to store, a gun
   from Gear onto a hardpoint to fit. Another designer is rebuilding the station layout
   (`SCREENS-1-STATION`): fit the grid into what landed, do not rebuild the station.
5. **Make it feel good.** A stack lifts with a slight scale and shadow, slots light as valid
   targets, a dropped crate leaves the panel with a short slide, counts tick. No sound work.
   Plain words, 12 px minimum type, matches the flight HUD's visor style.

## Prove

Bench fixtures so the bag can be shot without booting the game (as `tools/ui-bench.js` does for
the HUD): empty, half full with mixed goods, full, over capacity, dragging a stack outside,
the split dialog, the sealed-freight confirm, the Gear tab; at 1280×720 and 1920×1080 and one
phone size. `node scripts/ui-bench.mjs --shot=<ids> --walk` reports no findings. One live run
through the lock (`node scripts/fleet/game-lock.mjs run -- <probe>`): mine or buy something, open
the bag in flight, drag a stack out, see the crate in space in the frame, fly back over it and
pick it up. In the receipt: frame paths, the key, files changed.

## Files

A new bag module under `src/ui/` (and its CSS source; regenerate sidecars with
`node scripts/lib/buildUiCssSidecars.mjs`), the cargo panel code in `src/ui/hud.js` it replaces
(delete the old panel once the new one is wired: one bag, not two), the hold side of
`src/ui/station/**`, `tools/ui-bench.js`, tests. For a shared file use
`bash scripts/fleet/own-commit.sh begin <file>` and `… commit "<message>" <files>`.
