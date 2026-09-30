# Forge — how every flyable hull in SpaceFace is built

One kit, one surface language, one review loop. A ship differs from another ship by its **design**,
never by which agent or pipeline made it. If you are about to build, remaster or fix a ship body,
this is the page.

Around the kit: workflows (new places, interface art, merges, parallel agents), rules, budgets and
the open backlog live in [`design/program/GRAPHICS_PROGRAM.md`](../../../design/program/GRAPHICS_PROGRAM.md);
agent brief templates in [`briefs/`](./briefs/).

## Why

The fleet used to come from a dozen builders (factory lofts, MTX scripts, kitbash iterations, per-ship
baked 1K maps). Each shipped its own texel density, surface noise and material names, and the
runtime stacked restyling layers on top. Result: ships that read as leather, scraped tin or plastic,
none of them from the same game. Forge replaced the system, not just the models.

## The look (the bar every ship is judged against)

The camera is a 60° top-down chase at 144 WU (ship ≈ 170 px wide) with an optional close zoom at
58 WU (≈ 450 px). Design from that picture backwards.

1. **Plan silhouette first.** The camera sees the top. A ship must be identifiable from its outline
   alone: arrowhead, hammerhead, catamaran, barge, ring. Wings, sponsons, pods, booms and jaws are
   plan-view shapes (`plate`, `loft`), not decoration.
2. **Three values.** Light primary paint, mid secondary, dark mechanical. Dark reads as depth
   (recesses, intakes, gaps, engine blocks) and should be a visible share of the top view. The
   key light is strong: author paint channels ≈ 0x30–0x90 (Helios ivory `#bfb6a3` is the
   brightest allowed), dark armour ≈ 0x20–0x2c. The Look shows paint at close to its authored
   value with its chroma deepened, so a saturated mid-dark paint reads rich, not pastel. Look,
   then adjust.
3. **One identity colour, carried in bands.** Stripes and bands are cut into the geometry with
   `band()`, so they follow the form and stay crisp at any zoom. No painted-on decals, no text.
4. **Layered construction.** Panels are raised or recessed (`panel()`, `band(inset, depth)`),
   control surfaces are separate plates with a dark hinge gap, armour sits proud of the skin.
5. **Light is part of the ship.** Engine cores, red port / green starboard nav lights at the
   extremities, an amber beacon, lit windows on anything crewed, a lit trim line in the identity
   colour where the design has one. Space is dark; the ship should be recognisable by its
   lights. Lamps bloom: a `glow_*` strip reads as neon, so keep strips thin and deliberate.
   Window rows use `glow_warm` (lifted least, so a lit liner does not drown its own hull).
6. **Surfaces are manufactured, never noisy.** The shared panel texture set (256 px/m, world-locked)
   supplies recessed seams, dog-eared plates, hatches, vent slots and fastener rows, with
   near-uniform albedo so it never reads as a checkerboard of tinted tiles. No grain, grime,
   scratches or rust noise: at this camera broadband noise reads as leather. Wear, if a ship
   needs it, is a design element (a patched plate, a scorched nozzle ring), modelled.
7. **The finish is lacquer.** The Look ([`docs/visual-assets/LOOK.md`](../../../docs/visual-assets/LOOK.md))
   puts a clear coat on smooth dielectric paint: a sun glint, a mirror of the sky at the limb and a
   coloured rim. It comes from the finish's own roughness and metalness, so a ship gets it by
   using `paint`/`paint2`/`stripe`/`hazard`. Use `ceramic` or `stone` for a surface that must stay
   dry, `bare`/`gunmetal` for one that must read as metal. Curved forms and bevels are what
   catch the light: a slab of flat plate shows none of it.
8. **Everything attached.** No part floats. Guns sit on wings or pods, drives on pylons, masts on
   feet. The runtime adds nothing to a forge hull (see *Runtime* below), so what you model is what
   the player sees.
9. **Personality.** Each ship has one idea you can say in five words ("yellow-jacket needle
   interceptor", "ivory courier with pod drives"). Faction families share a language:
   - *Helios civil* — rounded, practical, ivory with one occupation colour, windows.
   - *Ashline raiders* — angular, blades and exposed machinery, dark rust/black, sodium-orange light.
   - *Work fleet* — chunky industrial, safety colours, cranes, clamps, hazard bands.
   - *Player hulls* — each its own marque; distinct plan shape per role.

## The kit (`forge.py`)

Blender coordinates: **+X nose, +Y port (left), +Z up (toward the camera)**, metres. Build at a
real-world scale; the runtime normalises size to the entity radius, so proportions matter, not
absolute metres.

| Call | Makes |
|---|---|
| `Ship(id, colors)` | the container; `colors` maps finishes to hex (`paint`, `paint2`, `stripe`, `hazard` …) |
| `loft(s, name, sections, material, bands, belly, back_material, front_material, count, mirror)` | hull body: superellipse sections along X (`x, w, ht, hb, zc, n, y`) |
| `plate(s, name, outline, z0, thickness, material, chamfer, chamfer_bottom, side_material, top_material, mirror)` | plan-view slab: wings, armour, pylons, fins (outline CCW from above, port side) |
| `plate_v(s, name, outline, offset, thickness, plane='xz'|'yz', material, chamfer, mirror)` | vertical slab: (x,z) outline extruded along +Y, or (y,z) along +X — fins, bulkheads, armour faces |
| `band(s, part, point, normal, width, finish, facing, inset, depth, mirror, region)` | livery band / stripe cut into a part; `region=((axis, lo, hi), …)` confines the cut to a zone; `mirror=True` is safe on keel-straddling parts (no doubled cut) |
| `panel(s, part, (x, y), (sx, sy), finish, inset, depth, mirror)` | rectangular raised/recessed plate cut into a part's top |
| `box`, `cylinder`, `nozzle`, `canopy` | primitives; `nozzle` has a dark throat and an emissive core; `cylinder(cap_material, cap_back_material)` lights a front cap while the back stays matte |
| `truss(s, name, p0, p1, w, bays, material, chord, web)` | square-section lattice beam, one mesh: four chords + per-bay zig-zag diagonals (masts, gate bridges, arms) |
| `ladder(s, name, p0, p1, w, rungs, material)` | two rails + rungs between two points, one mesh |
| `beams(s, name, [(p0, p1), …], w, material)` | many square struts in ONE mesh — one draw |
| `boxes(s, name, [(center, size[, rot_z]), …], material)` | many boxes in ONE mesh — window rows, crate yards, rim lights |
| `annulus(s, name, center, r_in, r_out, z0, thickness, material, side_material)` | flat ring deck — ring roads, pad aprons, hub decks |
| `sphere(s, name, center, r, material, segments)` | near-sphere dome/tank via the hull loft |
| `rock(s, name, center, radius, seed, quarry_plane)` | deterministic faceted boulder (same seed, same rock); optional flat quarried cut; default `stone` finish |
| `vent`, `rcs`, `antenna`, `windows`, `sensor_dome`, `container`, `fins`, `light` | designed greebles |
| `ring`, `dish`, `work_lamp`, `beacon`, `sweep` | torus flanges/rims, concave antenna dish with feed, camera-facing floodlight, lit beacon dome, beam swept along a path |
| `work_lamp(..., lens, halo=True)` | lit front lens only (matte back cap); `halo` adds a lit ring on the lens rim so the lamp reads from overhead |
| `box(..., rot=(rx, ry, rz), mirror_flip=True)` | tilted box; mirrored copy mirrors the rotation |
| `uv_scale=k` on `loft`, `plate`, `plate_v`, `box`, `cylinder`, `ring`, `sweep`, `beams`, `boxes`, `truss`, `ladder`, `annulus`, `sphere`, `rock` | per-part UV density: k multiplies the world-locked 4 m tile — use <1 on station-size panels |
| `s.hook_part('HOOK_SECONDARY_X', obj, ...)` | keeps damage parts (shed-first secondary, sensor, armour) as their own meshes |
| `s.detail = 1` / `2` | parts added while set are dropped at LOD2 / LOD1+ |
| `s.hook('HOOK_DRIVE_CORE', pos)`, `s.socket(name, pos)` | override default drive / socket positions |

Finishes (`FINISHES` in forge.py): `paint`, `paint2`, `deadmetal`, `stripe`, `gunmetal`, `dark`,
`bare`, `ceramic`, `hazard`, `glass`, `stone`, `glow_drive`, `glow_cyan`, `glow_red`, `glow_green`,
`glow_warm`, `glow_amber`. Roughness/metalness are calibrated per finish; ships choose colours, not
material physics. `stone` is a plain untiled rock surface (role `geology`), for `rock()` and
natural surfaces — no machinery panel tile. `deadmetal` is a hull-role skin (exports as
`Material_Hull`, so tint slots and name-based routes still apply) for surfaces that must read
near-black on screen: ordinary `paint` at a dark hex still lifts several stops under the sector
key light + env wash and reads pale, and high-metal skins mirror the bright warm env; `deadmetal`
is dielectric, near-black-albedo and rough, so derelicts and becalmed hulls stay charcoal-dark.
Variant suffixes work too (`deadmetal.deep` → `Material_Hull_deep`).

`ship.finish()` bevels every hard edge (3 segments, harden normals), applies weighted normals,
triangulates n-gons, and projects world-locked UVs. Every part is treated identically.

## Build, look, publish

```
blender -b --python tools/blender/forge/ships/<ship>.py              # preview export
node scripts/fleet-look.mjs --file=assets/ships/forge/preview/<file>.glb --views=inspect,close,top
#   open .devshots/fleet-look/<name>_<view>.png — the live material path, Helios lights, shipping post
#   for stations/places add `place` to --views: whole-bounding-sphere framing at the 60° chase tilt
node tools/blender/forge/publish.mjs <ship>                           # live: manifest, release, package, census
node scripts/flight-look.mjs --ship=ship_<id>                         # the real game, New Game flight
```

`tools/blender/forge/fleet.json` says which live body a forge ship replaces (`player` = three LOD
files; `npc` = one file with LOD0/1/2). Publish runs the repo's own release tooling for exactly that
ship and nothing else.

Review is looking. Open the stills yourself at chase and close zoom, name every defect you see
(floating part, clipped stripe, blown value, unreadable silhouette, part poking through), fix it,
re-shoot. A ship is done when nothing obvious is left and it holds its own next to the best hulls
already forged — not after a fixed number of cycles and not on a script's say-so.

## Runtime

Forge materials carry `spacefaceFinish: forge-v1`. The runtime then applies only role
environment intensity, the lamp gain and the shared surface response of the Look
(`docs/visual-assets/LOOK.md`); it skips the rescue layers for old
exports (roughness noise, family multipliers, occupational pigment, synthetic panel wells, palette
multiplies). Explicit player paint still recolours the hull. Forge bodies declare
`integratedHardpoints`, so fitted weapons/modules are not bolted onto them as kit parts.

## Performance

A forge hull is 10–40k triangles at LOD0, ≈ 10 draw calls (one per finish), and six shared
texture images (≈ 0.3 MB as KTX2 in release) instead of per-ship 1K bakes. LOD1 ≈ 40%, LOD2 ≈ 18%
(`forge_detail` greebles dropped).
