# Drill Minigame Graphics Revamp — Plan

## Goal

Replace the drill screen's flat, cheap 2D playfield with real 3D rendering in the game's own
engine (Three.js), so it looks congruent with the flight world. **Same gameplay, same grid, same
sim — it just gets drawn properly in 3D instead of flat 2D.** No toggle, no demo, no new mechanics.

## What changes vs. what doesn't

**Changes:** how the central playfield is *drawn* — the flat Canvas2D view becomes a lit 3D scene.

**Unchanged:** the gameplay (rover driving, drilling, machine-building), the grid/sim, saves, input,
and the surrounding DOM panels (inspector / ledger / dashboard — those already look good).

## What it will look like

- **Rock:** lit, carved 3D stone — warm silicate matrix + darker basalt, matching the flight world's
  asteroids. Tunnels and chambers you drill read as real recessed space with shadow, not flat tiles.
- **The rover:** a 3D drilling rover — chassis, treads, headlight, a drill mast that spins and throws
  sparks while boring — driving cell-to-cell with the same movement feel it has now.
- **Ore veins:** glowing nodule clusters, tinted per ore tier (iron, copper, … diamond), so you read
  value at a glance. Tier-locked veins render dull until your drill can reach them.
- **Gas pockets:** a translucent glowing hazard that lights the rock around it.
- **Machines:** the six machines (Core, Extractor, Gas Tap, Refinery, Fabricator, Cargo Port) as lit
  3D devices with emissive accents in the ship palette (cyan = command/lane, amber = power/process,
  green = healthy, red = fault).
- **Building:** hover a cell → it highlights; a translucent ghost of the machine snaps to the tile;
  the 8 contact-ring neighbors tint to show what the machine will feed on. Invalid cells read red.
- **Power/material lines:** glowing conduits along the floor.
- **Camera:** angled top-down orthographic — a precise, readable grid with real depth — scrolling to
  follow the rover exactly like the current 2D view does.

## Implementation — the actual work, in order

1. **Renderer skeleton.** New `src/ui/asteroid/asteroidRenderer3d.js`: its own Three.js renderer +
   orthographic camera + bloom, mounted into the drill viewport in place of the 2D canvas. Reads the
   real `state.drill.field` and `state.drill.avatar`.
2. **Terrain + rover (the Motherlode core).** Build the rock, cavities, ore, and gas from the *real*
   field grid (reusing the proven builders already in `src/render/asteroidInteriorPreview.js`). Build
   the rover, positioned from `avatar` using the existing interpolation. Camera follows it, matching
   the current scroll. Drilling a tile carves the 3D rock live, with dust + sparks.
3. **Machines + overlays.** Render the six machines and the power/lane conduits from `state.sites`.
   Add the build-mode cursor, ghost preview, and contact-ring tinting.
4. **Feedback + polish.** Drill sparks/dust, machine status glows (running / starved / fault), scan-
   pulse reveal, gas shimmer — and honor reduced-motion (animations off when the OS asks).
5. **Prove it.** Screenshot your *real* drill screen rendering in 3D (headed Chrome), rover drilling
   a live tile — so you see the actual result on the actual game, not a mockup.

## Files touched

- **NEW** `src/ui/asteroid/asteroidRenderer3d.js` — the 3D renderer.
- `src/render/asteroidInteriorPreview.js` — reuse/extend the proven builders (add the rover, gas_tap,
  refinery; make the rock read the live field instead of a fixed layout).
- `src/ui/asteroid/asteroidScreen.js` — swap the render path from the 2D renderer to the 3D one; map
  pointer/keyboard input through it.
- `src/ui/asteroid/asteroidRenderer2d.js` — left on disk, unused. Not deleted, not toggled — just a
  recoverable safety net.

## Honest engineering notes (details, not features)

- No user-facing toggle. The drill screen renders in 3D, period.
- Accessibility high-contrast mode and weak-GPU fallback are handled quietly if/when they actually
  come up — not front-loaded, not your decision to make now.
- Everything is read-only over the game state (the renderer draws; it never changes gameplay,
  credits, cargo, or saves), so it can't break the sim or the existing tests.

## The few things that are genuinely your call

- **Camera angle** — near-top-down vs. a slight tilt. I'll build the tilt; you tweak it when you see
  it. (One number.)
- **Commit the existing (working, uncommitted) Asteroid Sites feature first**, so the graphics work
  has a clean base to build on? Recommended — your review, your commit.

That's it. Everything else is just building.
