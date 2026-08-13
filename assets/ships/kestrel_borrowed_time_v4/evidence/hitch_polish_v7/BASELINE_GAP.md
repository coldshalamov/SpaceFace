# Hitch V7 baseline gap list

Live Hitch (V5) vs unconnected V6 remaster, 2026-08-12.

## What live still does

- Wired as the New Game ship: 27,318 triangles, 17 draws, nine sockets, collision hull, LOD1/LOD2, no baked plume.
- Semantic material set includes the old `BORROWED` decal slot.
- No `HOOK_*` damage meshes. Hurt states on the code-drawn hero do not drive this hull.

## What V6 already wins

- Drive, sensor, shoulders, radiators, repair pod rebuilt; `DIE LAUGHING` stencil exists.
- Same nine sockets and the same collision fingerprint.
- 21,093 triangles / 17 draws. `Material_V6_MarkingIvory` replaces the live `BORROWED` slot.

## What V6 still lacks (this pass)

- Role maps are near-flat. Construction will not read in the game camera until normals/ORM have real amplitude and mesh AO.
- Drive/midship still sit below the mockup studies (tapered vanes, coolant pipes, heat collar, spine conduits).
- No damage hooks, no canopy extras on the exported nodes.
- Not connected to live source/release.

## Mockups

Component studies under `reference/` are the construction target. They have no `DIE LAUGHING`. Keep and polish that stencil as extra identity, as paint, not a plaque.
