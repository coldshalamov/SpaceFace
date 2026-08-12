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

- `systems/plasmaStream.js` - player continuous liquid plasma: layered ridged-FBM filament web
  over transparent gaps (coarse core / mid body / fine sheath). Camera-facing ribbon strips built
  from ship-path history (the wake traces the real snake path), per-socket nozzle throat glow
  discs, eased boost envelope (width + radiance + flow rate), bounded minification lift at the
  far chase camera.
- `recipes/plasmaStreamRecipe.js` - live recipe id `player_liquid_plasma_v25.*`
- Wired from `src/render/vfx.js` (player plasmaStream, not NPC card plume)

Ribbon facing math: strip side vector is `axis × toCam` so the strip PLANE faces the camera.
Pointing the WIDTH AXIS at the camera leaves the strip edge-on (a bright line) — that caused the
wake to vanish at the top-down chase view. Keep the current math.

Look-dev iteration: `scripts/capture-thruster-lookdev.mjs --iter <name> --views game,low,turn
[--maneuver turn] [--speed WU/s] [--boost]` writes matched PNG crops, native-res crops, and an
ASCII luminance map + bright-pixel bbox to stdout — judge the maps and crops, not thumbnails.
Scenario views: `game` (real chase cam), `low` (reference-style broadside), `turn` (wake snake).
