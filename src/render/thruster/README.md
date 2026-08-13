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

`systems/plasmaStream.js` builds **three elements on three different timescales**. They are not
interchangeable, and collapsing them back into one path-history strip is what produced the original
"lazily animated" plume — a scrolling texture on a wedge that snaked along the ship's path.

| Element | Anchoring | Owns |
|---|---|---|
| `jet` | Rigid, nozzle-locked, straight along −ax, physical length in WU | Free-expansion cone, standing shock train, throat heat |
| `wake` | World-space Lagrangian parcels with their own aft momentum | Kink on a hard turn, detached puff on throttle cut |
| `snake` | Ship-path history through a world-space meander field | The long thin trailing thread |

Invariants worth keeping:

- **The jet never follows path history and never scales with ship speed.** A plume's size comes from
  the engine. Deriving its length from retained path samples made it breathe with velocity.
- **Filament noise is keyed to world units, not a normalized path UV.** `aFlow` is axial WU for the
  jet (advected aft at `exhaustSpeedWU`), and a value frozen at emission for parcels and the thread.
  UV-keyed noise stretches when the plume lengthens and slides when the mesh is rebuilt.
- **Boost is length, heat, collimation, and a one-shot ignition transient — not width.**
  `boostWidthMul` is deliberately ~1.08. A uniform width multiply is what read as a triangle
  inflating in place.
- **Longitudinal opacity comes from `samplePlasmaEnvelope` on the CPU** via `aFade`, so that curve
  stays testable in one place instead of being restated in GLSL.
- **Normalize before adding.** Every strip is additive; an unnormalized `lit` term saturated all
  layers into one white slab at the throat.
- `_writeStrip` collapses the unused tail of each buffer onto the last live station. Leaving it
  untouched parks stale vertices at the world origin and poisons anything reading the whole
  attribute (bounds, this gate, tooling) even though `drawRange` hides them on screen.
- `recipes/plasmaStreamRecipe.js` - live recipe id `player_liquid_plasma_v26.*`
- Wired from `src/render/vfx.js` (player plasmaStream, not NPC card plume)

Ribbon facing math: strip side vector is `axis × toCam` so the strip PLANE faces the camera.
Pointing the WIDTH AXIS at the camera leaves the strip edge-on (a bright line) — that caused the
wake to vanish at the top-down chase view. Keep the current math.

Look-dev iteration: `scripts/capture-thruster-lookdev.mjs --iter <name> --views game,low,turn
[--maneuver turn] [--speed WU/s] [--boost]` writes matched PNG crops, native-res crops, and an
ASCII luminance map + bright-pixel bbox to stdout — judge the maps and crops, not thumbnails.
Scenario views: `game` (real chase cam), `low` (reference-style broadside), `turn` (wake snake).
