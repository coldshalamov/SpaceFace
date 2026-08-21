<!-- LIFETIME: DURABLE -->
# What you see that is not a packaged model

The release manifest and `VISUAL_ASSET_CATALOG.md` only count **files on disk**.
They miss every object the game builds from cylinders, boxes, hoops, and balls
at runtime. That hole is why the 47-A sample kept falling off the upgrade list.

This census is the missing half. If you can see it in flight and it is not a
ship/place/pod GLB, it belongs here. Upgrade means keep the same object in the
same mission slot — not throw it away.

Do not use INFERENCE. Do not treat this as hitch work.

## A. You fly past these. They are still code shapes.

These are live world objects, not effects and not menu toys.

| What you see | Same object, every time | Notes |
|---|---|---|
| 47-A sample can with hoops (Payload / TOW) | evidence spindle | Cylinder + glowing core + clamp rings. **No model file.** |
| 47-A white rescue capsule | civilian pod | Capsule + scorched band + distress rings. **No model file.** |
| 47-A violet handoff marker + floor disc | Kessler beacon | Mast + hoops + big faint circle. **No model file.** |
| 47-A broken carrier hulk | Bourse wreck | Boxes and ribs. **No model file.** |
| Other towed cargo cans | generic payload | Cylinder + two orange collars + blinker. Used for ordinary TOW too, not only 47-A. **No model file.** |
| Ore / loot gems floating in space | pickup | Spinning diamond. Freight-custody pickups reuse the cargo can. |
| Credit chips | credit chip | Small code mesh. |
| Common rocks | asteroid | Generated lumpy rock (5 variants). Crystal rocks grow extra diamond shards. Named rock GLBs (`place_asteroid_rock_*`) are a different, rarer set. |
| Stations that missed their model | station fallback | Fat cylinder + two hoops + box spars. Authored station GLBs exist; this is what you get when they don’t load. |
| Jump gates / wormholes | gate | Giant hoop, inner ring, glowing disc, pylons. **No model file.** |
| Small mining drones | drone entity | Diamond body + stick arms + glow. Separate from the `place_mining_drone` GLB. |
| Generic wreckage | wreck | Broken tube spine + hull plates. |
| Disc mines | mine | Puck + hoop + warning lens. |
| Mass seed (deployed anchor) | mass seed | Diamond core + hoop + folding arms. |
| Massline snare ends | snare anchor | Short cylinder + rails + hoop. |
| Planets you fly near | planet | Shader ball (Helios Prime). Rings are painted on the look, not a separate model. |
| Distant suns | sun | Smaller shader ball. |
| Distant fake planets in the sky | background heroes | Sprites, not flyable bodies. |

## B. Already a model file — upgrade in place, do not start over

These were never “replace.” They are on the packaged list. Make the existing
file look like hardware from the bird’s-eye camera.

- Lane buoy, lane beacon, lane pin
- Cargo container pod
- Mining drone place, conveyor barge
- Hornet (and the rest of the flyable-ship remaster)
- Stations / outposts / wreck cathedral that already have a GLB
- Named rock GLBs (`rock_a/b/c`, seamed, graffiti)

If a live object in A has a cousin in B, upgrade B and then point A at it.
Do not invent a second object.

## C. Looks 3D. Not on the model-upgrade list.

Leave these unless a later campaign names them. They are effects, UI, or
debug — not “the can next to your ship.”

- Engine glow, trails, RCS puffs
- Lasers, bolts, explosions, shields
- Gravity wells / field volumes / massline cable
- HUD, radar, menus, ship preview fallbacks
- Asteroid Works interior (the mining-minigame room)
- Collision rings, graphics-lab toys
- Tiny nav-light beads on ships

## D. How this list gets used

1. Fly a route. If you can name the object and it is in **A**, it is code-built
   graphics and counts.
2. If it is in **B**, upgrade the file we already ship.
3. Do not add a new mission prop to skip A or B.
4. Hitch work may own the 47-A wiring file. Model the object anyway; hook later.

When something new is added as cylinders-in-code, add a row to **A** in the
same change. A packaged-manifest row is not enough.
