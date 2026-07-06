- Before iter1: no bevel modifier on hard edges for hull_starter (fixed by adding Bevel segs=4 width=0.03 per professional-techniques.md)
- Before iter1: no Weighted Normal for hull_starter (fixed by adding WN FACE_AREA)
- Before iter2: insufficient meso panels for hull_starter (fixed by inset + bevel)
- Before iter2: no GN for greeble variation on hull_starter (fixed by adding Geometry Nodes instance)
- Before iter3: flat material on hull_starter (fixed by node layering EdgeWear + CavityDirt)
- Before iter3: no AO bake linked for hull_starter (fixed by TEX_IMAGE + AO node for ao_bake.png)
- Before: no roughness var for hull_starter (fixed by linking rough_bake)
- Before: no normal detail for hull_starter (fixed by normal_bake + NormalMap)
- Before: inconsistent bevel radii on hull_starter (fixed by standardized bevel)
- Before: lacked support loops for hull_starter (fixed in modeling)
- Before: poor texel for hull_starter (fixed by advanced unwrap)
- Before: no material zones for hull_starter (fixed by multiple slots)
- Before: no wear for hull_starter (fixed by curvature/Pointiness + noise)
- Before: no decals for hull_starter (fixed by projected or separate)
- Before: no trim for hull_starter (fixed by UV snap)
- Before: no compositor for hull_starter (fixed by post dilation/levels)
- Before: no Clearcoat for hull_starter (fixed in Principled)
- Before: no animation for hull_starter (fixed by armature for moving if applicable)
- Before: low fidelity for hull_starter (fixed by high-poly mindset + bakes)
- Before: no character for hull_starter (fixed by weathering per type: scuffs, stencils, honest wear)

- Additional: real MCP techniques applied for hull_starter (bevel/WN/inset from professional-techniques.md).

- Unique for hull_starter : specific geometry details (e.g. panels, curves, greebles) from MCP inspection and passes on this exact part.

