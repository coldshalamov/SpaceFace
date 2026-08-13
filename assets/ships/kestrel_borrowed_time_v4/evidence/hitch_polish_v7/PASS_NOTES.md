# Hitch V7 pass notes

## Pass 0 baseline

Live V5 still wins sockets/LOD wiring on the player route. Isolated V6 already wins drive/sensor/shoulders/DIE LAUGHING, but ships near-flat maps. See BASELINE_GAP.md.

## Pass 1 inspect (first V7 build, 76AA3A52)

Keep: nine sockets, six HOOK_* draws, CANOPY node, no plume, DIE LAUGHING present, clay view has no plaque, LOD family 36524 / 15490 / 9834.

Revise:
- Shared-map AO bake was wrong (overlapping UVs). Construction still reads flat. Unique-UV transfer bake on joined meshes.
- Drive coolant pipes too thin vs mockup.
- Stencil still too clean; more chips and overspray, dirtier ivory.

## Pass 2–4 source change

Unique mesh AO/albedo/normal transfer after LOD join failed finalize (UVs outside 0–1, degenerate mapped triangles). Reverted to tiled role maps with stronger ORM/normal variation. Thicker drive pipes, sensor feed horn, radiator lips, midship conduits, dirtier DIE LAUGHING. Skip-unique-bake family fingerprint AD803A55: 36902 / 15728 / 9856.

## Pass 5 inspect (current production blend, skip-unique-bake)

Matched cameras from `kestrel_hitch_polish_v7_production.blend`:

| Shot | Disposition | Note |
|---|---|---|
| Whole-ship three-quarter | keep | Used Free Frontier boat; DIE LAUGHING reads as spray; paint/metal/glass/heat separate; no toy torus, chiclet nozzle, neon hoop, or BORROWED |
| Clay three-quarter | keep | Stencil disappears (not a plaque); drive vanes, shoulders, radiator lips, conduits read as construction |
| Drive grazing vs mockup | keep | Segmented vanes, pipes, collar, core glow. Cleaner than the mockup soot study; not a P0/P1 |
| Midship vs mockup | keep | Spine conduits, sensor horn, repair-green, stencil on armor |
| DIE LAUGHING ortho + grazing | keep | Hand-cut stencil on the shoulder; grazing has no plaque thickness. Ortho is a tight letter crop, not a gameplay camera |

No P0/P1 remain for the live Hitch bar. Promote the skip-unique-bake family over live Hitch.

## Pass 5 live route

New Game capture loaded `wholeships/kestrel.glb` as authored-root with no retained fallback. LOD0/1/2 three-quarter, 120px, and under-45px shots plus the canonical player-route close/mid all keep Hitch identity. Runtime cyan plume is the existing thruster recipe, not a baked torus. Continue and context-restore still resolve the same whole ship.
