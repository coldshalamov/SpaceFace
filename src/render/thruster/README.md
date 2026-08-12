# Player thruster (plasma stream)

## Before claiming thruster visual work is done

Unit tests alone are **not** enough. A thruster that passes envelope math can still be backwards or have no wake in-game.

**Required before any thruster “done” claim:**

```bash
npm run check:thruster:plasma-unit
npm run check:thruster:lookdev
```

Then **open and look at** the gate PNGs it writes (paths printed on PASS):

- `rear34-bloom-off.png` — structure without bloom soup
- `rear.png` — axial
- `rear34.png` — bloom on

`check:thruster:lookdev` **fails** if:

1. Trail tip is not aft of the nozzle (backwards / nose jet)
2. Path history is too short (no real wake)
3. Strip mesh span is a stub
4. Headless captures are missing

If the gate is green but a game screenshot still looks wrong, the game path differs from look-dev — fix the live bind, re-run the gate, and capture in-game before claiming done.

## Axis convention

Production sockets match ContinuousPlume: **jet extends along −ax**.  
`vfx._writeProductionPlumeSockets` sets `ax = -exhaustForward`. PlasmaStream must honor that.

## Live system

- `systems/plasmaStream.js` — player continuous liquid plasma
- `recipes/plasmaStreamRecipe.js` — live recipe id `player_liquid_plasma_v24.*`
- Wired from `src/render/vfx.js` (player plasmaStream, not NPC card plume)
