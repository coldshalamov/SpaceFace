# Helios hero and traffic fleet authoring

`hero_fleet.py` imports the existing authored bodies and changes selected visible construction.
It does not replace hull identities, move gameplay sockets, change collision, or write a release.
Run with Blender 5.1, for example:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --background --threads 2 --python tools/blender/helios_remaster/hero_fleet.py -- --build --lods
```

Use `--only helios_arclight,volatiles_tanker` for a subset. Candidates and editable surfaced scenes
land under `.devshots/helios-remaster/hero-fleet/<asset>/`. `candidate.json` binds each result to its
source and candidate SHA256. Runtime promotion and independent visual review belong to the controller.
The optional `--render` mode uses the actual D144/D58 chase pose; use the live Three.js rig for final
material judgment and avoid concurrent Cycles jobs on this machine.

The source-blob registry makes authoring repeatable after promotion: if the checked-out source already
contains this remaster, the builder reads its pinned original Git blob instead of cutting the remaster
again. Update the registry deliberately when adopting a newer source body. It never resets Git or
checks out old files into the shared tree.

Construction is specific to each craft:

| Family | Authored change |
| --- | --- |
| Hitch / Kestrel | Recessed aft heat-service pockets; all personalized plating, marks, tools and working asymmetry retained. |
| Lark | Swept, gently folded canards with open wing-root cooling passages. |
| Cradle | Deep cargo-arm service wells and broad folded access leaves, plus aft heat sump. |
| Span | Six individually cut cargo-module service openings with formed access covers. |
| Ashline Rig | Open transfer truss connects aft drive mounting to salvage spine; aft deck servicing pocket. |
| Survey Pin | Recessed optical tray and a separate heat-transfer tray. |
| Massline liner | Three faceted glazed passenger lantern bays with bronze ribs, warm recessed light coves and enamel ridge covers. |
| Arclight | Original central slab removed; two stepped enamel bridge/reactor islands flank an exposed pressure-accumulator/service deck with knees, catwalks and side glazing. |
| Volatiles tanker | Segmented pressure crowns, cut valve wells, radial clamps and pressure-seat flanges on retained vessels. |
| Inspection cutter | Separate recessed spectrum/scanner assemblies with protected optics and indicators. |
| Wasp | Paired nacelle-root thermal cavities, retaining its strong continuous armor and canopy. |
| Hornet | Dorsal heat-exchanger block opened into a constructed service trench. |
| Bastion | Offset weapon-service and cooling pockets cut into retained armor. |
| Drifter | Staggered maintenance and cooling openings that preserve the compact clipper shape. |

The material bill is in `hero_fleet_preflight.json`. New nickel, oxidized alloy, heat copper,
ceramic, enamel and optical materials have explicit scalar responses; no fake baked maps are claimed.
Source maps and identity markings are retained. Materials with real authored construction carry
`extras.spacefaceRemasterGeometry=true` so runtime layout shaders can suppress simulated service wells.

Important exporter detail: source material meshes merge overlapping and disconnected manufactured
components. Cutting that entire merged mesh can make Blender's Boolean solver erase unrelated hull
islands. The builder reconnects coincident exported seams, separates manufactured islands, cuts only
intersecting pieces, and rejoins the original material groups. This is a geometry correctness step,
not extra model fragmentation in the exported runtime asset. Added assemblies are also joined by
material and LOD. Original `asset.extras.spacefaceAsset` and scene identity contracts survive export;
obsolete acceptance hashes do not.

LOD0 retains the authored close-range construction. LOD1 keeps openings, mechanisms and broad
shutters with simpler edge sections; LOD2 keeps the negative space, main pressure crowns, truss and
lantern silhouette while removing small fittings, clamps and coil returns. Distant new mechanical
parts reuse existing material roles and join their static groups. External LOD filenames determine
detail even when an older export labels every node `LOD0`. No animated hook, fan or gimbal is merged.
Run `node tools/blender/helios_remaster/hero_fleet_receipt.mjs` before promotion for exact baseline and
candidate hashes, per-LOD triangles/raw primitives, and socket identity/transform comparison.
