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

`systems/plasmaStream.js` builds **two independent ribbon elements plus the throat glow**. They are
not interchangeable, and merging them is the mistake to guard against — see `ribbon/plasmaRibbons.js`
for the four rejected constructions that led here.

| Element | Module | Anchoring | Length is set by | Owns |
|---|---|---|---|---|
| plume | `ribbon/plasmaRibbons.js` | Nozzle-local, straight along −ax | The **throttle**, ~17 WU at full | The jet: throat heat, collimated core, breakup into ribbons |
| contrail | `ribbon/contrailTrail.js` | World-space record of nozzle positions | The **distance flown** | The Snake history braid, cold condensate dispersing |
| throat | inline quads | Nozzle-locked billboards | n/a | Bell glow, including at idle |

Invariants worth keeping:

- **A jet is short and a history is long, and they are different objects.** A steady jet genuinely
  stands still relative to its bell, so nozzle-local is correct for it; two seconds of history is
  hundreds of WU at cruise, which is a tail, not a plume.
- **The contrail may only occupy positions the nozzle actually occupied.** It records poses and
  advects nothing. Anything pushed aft would be somewhere the ship has never been — that is what put
  a full-length ribbon behind a stationary ship.
- **Plume structure rides a travelling wave** (`axialFraction * uAxialFreq - uTime * uFlowRate`), so
  gas visibly flows through it. Deformation keyed only to state frozen at emission gives a form that
  is constant in the ship's frame: a still image being stretched.
- **Transparency is material, never an animation channel.** Alpha comes from dilution as the column
  billows, the sheet running out at its rim, and real dispersal. Visibility is carried by
  *temperature* instead — additive material at zero radiance is already invisible.
- **The throttle moves length, heat and reach.** Not opacity, and not a uniform width multiply, which
  is what read as a triangle inflating in place.
- **Sheets must be wide enough to overlap.** Narrow sheets read as bright wires with gaps between
  them — pen-and-ink rather than exhaust. Overlap builds a volume; the creases are then what the eye
  picks out, via the grazing term.
- **One authority for "is the drive firing"**: `EMIT_FLOOR` in `ribbon/driveEnvelope.js`. A second
  hand-picked threshold below the idle glow left the drive reading as emitting while parked.
- `recipes/plasmaStreamRecipe.js` - live recipe id `player_liquid_plasma_v26.*`
- Wired from `src/render/vfx.js` (player plasmaStream, not NPC card plume)

Look-dev: `scripts/ribbon-plume-lab.html` via `node scripts/capture-ribbon-plume.mjs`.
`--maneuver hold` is the important one: the ship does not move and the drive is steady, so the
reported `flow` delta measures gas moving through the jet and nothing else, and the contrail must be
absent entirely.

Ribbon facing math: strip side vector is `axis × toCam` so the strip PLANE faces the camera.
Pointing the WIDTH AXIS at the camera leaves the strip edge-on (a bright line) — that caused the
wake to vanish at the top-down chase view. Keep the current math.

Look-dev iteration: `scripts/capture-thruster-lookdev.mjs --iter <name> --views game,low,turn
[--maneuver turn] [--speed WU/s] [--boost]` writes matched PNG crops, native-res crops, and an
ASCII luminance map + bright-pixel bbox to stdout — judge the maps and crops, not thumbnails.
Scenario views: `game` (real chase cam), `low` (reference-style broadside), `turn` (wake snake).
