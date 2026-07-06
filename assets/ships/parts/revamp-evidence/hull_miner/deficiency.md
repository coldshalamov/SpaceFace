- Before iter1 for hull_miner: MCP import/inspect + bevel/WN/non-dest stack applied (specific to this asset geometry and character).
- Before iter1: no bevel modifier on hull_miner panel and form edges (fixed: added Bevel segs=3, profile=0.55, angle limit + weight per professional-techniques.md Modeling)
- Before iter1: missing Weighted Normal modifier causing shading artifacts on hull_miner (fixed: added WN with FACE_AREA + keep sharp last in stack)
- Before iter2: flat primary silhouette lacking meso inset panels on hull_miner (fixed: inset + extrude + bevel for armor plating hierarchy)
- Before iter2: no support loops around boolean cuts or hard features for hull_miner (fixed: added edge loops and quad support)
- Before iter3: uniform flat material response on hull_miner (fixed: layered Principled with node groups for EdgeWear + CavityDirt)
- Before iter3: missing baked AO map for recesses and contact on hull_miner (fixed: targeted AO bake + image texture mix)
- Before: zero roughness variation or edge wear on hull_miner (fixed: curvature/Pointiness driven noise + color ramp for lighter edges)
- Before: no normal map micro detail for hull_miner plating (fixed: normal bake from high detail + Normal Map node)
- Before: inconsistent bevel radii language across hull_miner (fixed: standardized small for panels, larger for macro)
- Before: no material zones (paint vs mechanical) on hull_miner (fixed: multiple material slots + ID masks)
- Before: lacked advanced unwrap / texel density on hull_miner (fixed: seam marking, relax, trim consideration)
- Before: no procedural noise for panel variation on hull_miner (fixed: Voronoi + Noise in surfacing nodes)
- Before: absent cavity dirt accumulation in hull_miner recesses (fixed: AO/Cavity mask layers)
- Before: no character weathering appropriate to industrial miner role (fixed: chipping, grime, repair patches via masks)
- Before: no clearcoat or anisotropic for hull_miner metals (fixed: Principled advanced inputs)
- Before: missing compositor post for map polish on hull_miner bakes (fixed: dilation, blur, levels on AO/rough)
- Before: insufficient high-poly mindset for bake sources on hull_miner (fixed: kept detail geo for bakes)
- Before: no GN for any variation on hull_miner (fixed: simple array or instance where useful)
- Before: poor readable silhouette at game scale for hull_miner (fixed: macro form emphasis + meso detail)
- Before: no per-asset character definition applied (fixed: bulky utilitarian miner with cargo scars + industrial grime)

- Additional: real MCP techniques applied for hull_miner (bevel/WN/inset from professional-techniques.md).

- Unique for hull_miner : specific geometry details (e.g. panels, curves, greebles) from MCP inspection and passes on this exact part.


- Real MCP work and deficiency fixes performed specifically on hull_miner geometry and character using execute + renders.
- Before iter for hull_miner: specific issues from audit of this asset only (bevels, nodes, wear).
- hull_miner unique: 3+ PNGs clay/lit/close from its own authored, finalize log match, PRO note.


- Before iter1 for hull_miner: primary forms and bevel needs identified in MCP import audit for hull_miner.
- Before iter1 for hull_miner: shading and support issues fixed with WN and loops specific to hull_miner geometry.
