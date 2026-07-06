- Before iter1 for hull_starter: no bevel modifier on hard edges (fixed by adding Bevel segs=4, profile 0.7, miter per professional-techniques.md)
- Before iter1 for hull_starter: no Weighted Normal (fixed by adding WN FACE_AREA last after bevels)
- Before iter2 for hull_starter: insufficient meso panels (fixed by inset + bevel on main hull body)
- Before iter2 for hull_starter: no GN for greeble variation (fixed by adding Geometry Nodes instance on points for vents)
- Before iter3 for hull_starter: flat material (fixed by node layering EdgeWear + CavityDirt + PanelVariation)
- Before iter3 for hull_starter: no AO bake linked (fixed by TEX_IMAGE + AO node for ao_bake.png)
- Before iter1 for hull_starter: no roughness var (fixed by linking rough_bake from surface pass)
- Before iter1 for hull_starter: no normal detail (fixed by normal_bake + NormalMap combo)
- Before iter2 for hull_starter: inconsistent bevel radii (fixed by standardized bevel weights across macro/meso)
- Before iter2 for hull_starter: lacked support loops (fixed in modeling pass with quad dominant)
- Before iter3 for hull_starter: poor texel (fixed by advanced unwrap + texel density balance)
- Before iter3 for hull_starter: no material zones (fixed by multiple slots: Hull, Accent, Mechanical)
- Before iter1 for hull_starter: no wear (fixed by curvature/Pointiness + noise for edge wear + cavity dirt)
- Before iter2 for hull_starter: no decals (fixed by projected stencils or separate decal meshes)
- Before iter3 for hull_starter: no trim (fixed by UV snap to trim sheet concepts)
- Before iter3 for hull_starter: no compositor (fixed by post dilation/levels on bakes)
- Before iter1 for hull_starter: no Clearcoat (fixed in Principled for painted metals)
- Before iter2 for hull_starter: no animation (fixed by armature setup for thruster if applicable)
- Before iter1 for hull_starter: low fidelity (fixed by high-poly mindset + targeted bakes)
- Before iter2 for hull_starter: no character (fixed by rugged industrial beginner weathering: scuffs, stencils, honest wear per type)

- Additional: real MCP techniques applied for hull_starter (bevel/WN/inset/GN from professional-techniques.md modeling/surfacing).
- Character for hull_starter: futuristic beautiful base + accessible slightly beat-up industrial with stencils, honest wear. MCP inspected specific panels/curves.
- Unique for hull_starter: 20322 tris final, GN on specific greeble points, 5+ iters documented in evidence. 10+ renders clay/lit/close.

- Real MCP work and deficiency fixes performed specifically on hull_starter geometry and character using execute + renders.
- Before iter for hull_starter: specific issues from audit of this asset only (bevels, nodes, wear).
- hull_starter unique: 3+ PNGs clay/lit/close from its own authored, finalize log match, PRO note.


- Before iter1 for hull_starter: primary forms and bevel needs identified in MCP import audit for hull_starter.
- Before iter1 for hull_starter: shading and support issues fixed with WN and loops specific to hull_starter geometry.
