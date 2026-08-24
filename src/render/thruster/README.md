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

`systems/plasmaStream.js` builds **two independent ribbon elements plus the throat glow**. They are not interchangeable.

| Element | Module | Anchoring | Lifetime / reach is set by | Owns |
|---|---|---|---|---|
| plume | `ribbon/plasmaRibbons.js` | Nozzle-local, straight along −ax | Current drive, ~17 WU at full | The live jet: throat heat, collimated core, breakup into ribbons |
| contrail | `ribbon/contrailTrail.js` | Immutable world-space nozzle samples | Each sample’s elapsed age only | The glowing burn history already left in space |
| throat | inline quads | Nozzle-locked billboards | n/a | Bell glow, including at idle |

## Contrail contract: a recorder, never a rope

A contrail sample is an immutable historical fact: **the emitting thruster base occupied this exact world-space position at this prior time**.

After birth, no system may alter that sample’s position or lifetime except by advancing its age. In particular:

- Never replace sample 0 with the current nozzle position.
- Never move the newest sample when movement is below the sampling threshold.
- Never append positions while the drive is not emitting.
- Never reel, suck, retract, tail-trim, distance-cap, advect, or steer recorded history.
- Never couple an old sample to current throttle, speed, heading, ship transform, or nozzle transform.
- Never add a pulse clock, travelling band, flicker, or time-driven geometric deformation to history.
- A burn may cool and fade monotonically from its own age. **Age is the only visibility/removal clock.**
- An emission gap or teleport starts a disconnected segment. It does not bridge the gap and does not erase the earlier segment.
- When the ship slows or stops, the existing burn remains where it was laid down and fades there. A growing gap between the ship and that old burn is correct.

The compatibility method `ContrailTrail.bandFlash()` must remain a constant `1`. The forge is steady; it does not share a pulse clock with history.

Tests in `test/plasma-stream-thruster.test.mjs` enforce these semantics directly by snapshotting sample positions, moving the cold ship away, and proving that every young sample remains numerically stationary while only its age changes.

## Other invariants worth keeping

- **A jet is short and a history is long, and they are different objects.** A steady jet genuinely stands still relative to its bell, so nozzle-local is correct for it. History belongs to world space.
- **The contrail may only occupy positions the emitting nozzle actually occupied.** It records poses and advects nothing. Anything pushed aft would be somewhere the ship has never been.
- **Plume structure rides a travelling wave** (`axialFraction * uAxialFreq - uTime * uFlowRate`), so gas visibly flows through the live jet. This animation belongs to the plume and is forbidden in the history recorder.
- **Transparency is material, never a live-drive animation channel.** Alpha comes from dilution, sheet edges and elapsed history age.
- **The throttle moves live-plume length, heat and reach.** It does not rewrite recorded history.
- **Sheets must be wide enough to overlap.** Narrow sheets read as bright wires with gaps between them; overlap builds a volume.
- **One authority for “is the drive firing”**: `EMIT_FLOOR` in `ribbon/driveEnvelope.js`.
- `recipes/plasmaStreamRecipe.js` — live recipe id `player_liquid_plasma_v26.*`
- Wired from `src/render/vfx.js` (player plasmaStream, not NPC card plume)

Look-dev: `scripts/ribbon-plume-lab.html` via `node scripts/capture-ribbon-plume.mjs`.
`--maneuver hold` is important: the ship does not move and the drive is steady, so the live jet may flow but the contrail must not accumulate a spatial path.

Ribbon facing math: strip side vector is `axis × toCam` so the strip plane faces the camera. Pointing the width axis at the camera leaves the strip edge-on and can make the wake disappear at the chase view.

Look-dev iteration: `scripts/capture-thruster-lookdev.mjs --iter <name> --views game,low,turn [--maneuver turn] [--speed WU/s] [--boost]` writes matched PNG crops, native-resolution crops, and an ASCII luminance map + bright-pixel bounding box to stdout. Judge the maps and crops, not thumbnails. Scenario views: `game` (real chase camera), `low` (broadside), `turn` (recorded path through a maneuver).
