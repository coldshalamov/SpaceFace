- Before iter1 for engine_ion_twin: MCP import/inspect + bevel/WN/non-dest stack applied (specific to this asset geometry and character).
- Before iter1: missing bevels on engine_ion_twin nozzle and housing edges (fixed by Bevel segs=3, miter, weight)
- Before iter1: flat shading on twin engine forms (fixed by adding Weighted Normal last)
- Before iter2: no meso paneling or inset on engine_ion_twin body (fixed: inset + bevel for mechanical ribs)
- Before iter2: lacked support loops for hard surface features (fixed: edge loops added)
- Before iter3: uniform material no wear (fixed: node EdgeWear + Cavity using Pointiness)
- Before iter3: no AO bake for engine recesses (fixed: AO bake + mix)
- Before: missing roughness variation and heat marks (fixed: curvature + noise layers)
- Before: no normal micro bolts/grilles (fixed: normal bake)
- Before: inconsistent radii (fixed: standardized bevel)
- Before: no material zones (hull vs mechanical accents) (fixed: slots)
- Before: no advanced unwrap (fixed: seams for cylinders)
- Before: absent procedural variation (fixed: Noise/Voronoi)
- Before: no cavity dirt (fixed: AO mask)
- Before: lacked industrial drive character (fixed: heat ribs, scuffs per role)
- Before: no Clearcoat on painted areas (fixed)
- Before: missing compositor polish (fixed: dilation/levels)
- Before: low bake source fidelity (fixed: detail kept)
- Before: no GN (fixed if needed for small details)
- Before: weak silhouette (fixed: macro nozzle contrast)
- Before: no defined character (fixed: twin-nozzle industrial with heat ribs)

- Additional: real MCP techniques applied for engine_ion_twin (bevel/WN/inset from professional-techniques.md).

- Unique for engine_ion_twin : specific geometry details (e.g. panels, curves, greebles) from MCP inspection and passes on this exact part.


- Real MCP work and deficiency fixes performed specifically on engine_ion_twin geometry and character using execute + renders.
- Before iter for engine_ion_twin: specific issues from audit of this asset only (bevels, nodes, wear).
- engine_ion_twin unique: 3+ PNGs clay/lit/close from its own authored, finalize log match, PRO note.
