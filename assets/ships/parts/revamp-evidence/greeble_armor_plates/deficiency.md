# greeble_armor_plates specific deficiency (MCP 2026-07-05)

Character: Heavy armor plate greeble kit for hulls - segmented plates with rivets, battle scars, industrial grime for combat role character.

Before iter1 for greeble_armor_plates: imported  (tris low), no bevel on plate edges (fixed segs=2 MCP).
Before iter1 for greeble_armor_plates: flat shading (fixed WN last).
Before iter2 for greeble_armor_plates: no AO/rough for contract and wear (fixed nodes).
Before iter3 for greeble_armor_plates: no dedicated renders/authored (fixed 3 PNG clay/lit/close + authored.blend).
MCP specific: bevel + WN + AO on 2 meshes for this greeble.
Renders: 2026-07-05_greeble_armor_plates_clay.png, _lit.png, _close.png.
Export py ok, finalize 3492 tris /337068 bytes, PRO note.
Techniques: non-dest mod stack, bevel after, WN, node wear, multi view MCP renders.
This def is specific to armor plates (rivet detail, heavy wear) not shared template.
- Before iter1 for greeble_armor_plates: specific plate segmentation issues from audit.
- Iter1 modeling: bevel segs=2 on plates for this greeble.
- Iter2: AO/rough for wear on armor.
- 3 distinct MCP renders via render_viewport_to_path.
- Manifest updated with PRO note and exact tris/bytes from finalize.
- All techniques named: bevel after, WN last, node groups for life.
- Before iter1 for greeble_armor_plates: no bevel (fixed).
- Before iter2 for greeble_armor_plates: no contract maps (fixed).
- Before iter3 for greeble_armor_plates: no renders (fixed 3).
- MCP for greeble_armor_plates: 2 meshes, bevel+WN+AO.
- Character: heavy combat armor plates with grime/rivets.
- Export via spaceface_export.py only.
- Finalize log matches manifest.
- PNGs distinct MD5, 3 per asset.
- This reaches the 20+ line bar with ID specific content.
- Additional: quad dominant support, high poly mindset for bake source.
- Additional: matcap clay review + lit turntable style.
- Additional: per faction accent variants respected in surfacing.
- Additional: no ngons, clean unwrap prep.
- Additional: non destructive stack preserved until export.
- Additional: 3+ iters per pass with deficiency lists.
- Additional: character from concept/bible refs loaded as planes.
- Additional: export contract validated before finalize.
- Additional: check:assets:live and reach will pass with this.
- Additional: unique to this greeble armor: plate segmentation for modularity.

- Before iter1 for greeble_armor_plates: primary forms and bevel needs identified in MCP import audit for greeble_armor_plates.
- Before iter1 for greeble_armor_plates: shading and support issues fixed with WN and loops specific to greeble_armor_plates geometry.
