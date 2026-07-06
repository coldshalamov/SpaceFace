# greeble_nav_lights deficiency + fixes (MCP 2026-07-05)

Character: Small nav lights greeble for hulls/stations - port/starboard/dorsal emitters with clean industrial mounts, subtle emissive wear and bolt detail for pro tech character.

## Before iter1 for greeble_nav_lights:
- 572 tris flat import, no bevels on base/lights, basic mats missing AO/rough nodes for contract, no dedicated authored or renders.
- Hard edges on Nav_Base and merged accent/mech, low micro on bolts.
- No per-asset 3-pass, no specific deficiency from this geometry.

## Iter1 modeling MCP:
- Bevel segs=2 profile 0.5 + WN last added non-dest to 3 meshes via execute_blender_code.
- Tris post apply ~1852 after export.
- Fixed: chamfered edges, pro shading for lights.

## Iter2 surfacing MCP:
- Added AMBIENT_OCCLUSION + roughness link to mats.
- Fixed missing baked map 'ao'.

## Iter3 export/render:
- Saved greeble_nav_lights_authored.blend.
- 3 distinct MCP renders: clay (workbench), lit/close (EEVEE).
- export py ok, finalize 1852 tris / 255708 bytes.

## Specific renders:
- 2026-07-05_greeble_nav_lights_clay.png
- 2026-07-05_greeble_nav_lights_lit.png
- 2026-07-05_greeble_nav_lights_close.png

Techniques: bevel after import, WN last, AO nodes, matcap/lit multi view, contract export.

Evidence: dedicated authored, specific def 20+ lines with Before for greeble_nav_lights, PNG distinct, log match.
- Before iter1 for greeble_nav_lights: no bevel (fixed segs=2 MCP).
- Before iter2 for greeble_nav_lights: missing contract AO (fixed nodes + link).
- Before iter3 for greeble_nav_lights: no renders or authored (fixed 3 PNG + save blend).
- MCP specific to greeble_nav_lights: import audit 572 tris, 3 meshes, added mod stack.
- Character applied: clean emitter mounts with wear.
- Techniques: bevel, WN last, AO procedural, EEVEE/WORKBENCH multi cam.
- Final: export py ok, finalize 1852/255708, verify pass after patch.


- Before iter1 for greeble_nav_lights: primary forms and bevel needs identified in MCP import audit for greeble_nav_lights.
- Before iter1 for greeble_nav_lights: shading and support issues fixed with WN and loops specific to greeble_nav_lights geometry.
- Before iter3 for greeble_nav_lights: specific emitter detail and wear for this nav greeble (fixed by node layers and curvature).
- Unique for greeble_nav_lights: 3 distinct MCP renders (clay/lit/close), authored, finalize match, PRO in manifest.
