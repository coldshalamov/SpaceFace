# Look unify — material audit, shared-layer bands, rendered before/after

Branch `look/unify-materials`. 286 production models (`assets/ships/release/parts`, everything referenced by src),
each rendered live through `scripts/fleet-look.mjs` (SwiftShader, bloom on, no prewarm), views inspect + side.

## Audit causes
1. Chrome mechanical metal: 304 materials scaled by `worn_tool_metal` (rough ×0.70, env 2.55) on top of authored values.
2. Pale flat paint (#e5dfd4, #ffffff, #f1efe7, above ~#bfb6a3) blows out under the key light + bloom.
3. Lamps exported as paint (`esk_light_*` tagged hull) make paint glow.
4. Unknown/legacy roles (maintenance_mark, heat_affected_alloy, copper_coil, exposed_alloy, engine_ceramic) bypassed role tables.
5. Retail role-table drift lead was stale: master is 0/286. This branch's role changes rebuilt the affected packages; drift is 0/286 again.
6. Pelican/wasp load failures are in `wholeships/pelican.glb`/`wasp.glb`, which are not referenced in src (live: `*_production_v1`). Not ours, excluded.

## Style target / shared-layer fix
`src/data/materialRoleBands.js`: per-role roughness/metalness/env/emissive bands, role aliases, substance overrides
(glass by name, paint-on-mechanical → hull, scorch → rubber, lamp → signal), flat-paint value ceiling at sRGB 0xbf
(skipped for authored base maps and illustrated-livery materials, whose colour-factor contract is kept).
Applied at admission in `authoredMaterialProfiles.js` (Forge + legacy + geology correction).

## Static material spread (all 2501 materials)
Before (master):
```
materials 2507 files 288
role             n    r mean±sd    m mean±sd  env mean±sd chrome
signal         726  0.41±0.09   0.02±0.14   0.44±0.16 0
hull           619  0.49±0.06   0.15±0.20   1.22±0.11 0
mechanical     558  0.46±0.14   0.74±0.17   1.75±0.35 304
accent         152  0.45±0.10   0.11±0.15   1.18±0.13 0
warning        121  0.51±0.04   0.08±0.15   0.97±0.10 0
glass           94  0.08±0.06   0.02±0.14   1.04±0.16 0
drive           88  0.41±0.05   0.00±0.00   0.60±0.00 0
ceramic         83  0.72±0.08   0.00±0.00   0.71±0.04 0
geology         41  0.93±0.08   0.38±0.47   1.00±0.00 0
service         19  0.72±0.20   0.45±0.25   1.45±0.00 0
radiator         2  0.45±0.00   0.35±0.00   1.70±0.00 0
maintenance_mark     1  1.00±0.00   1.00±0.00   1.00±0.00 0
heat_affected_alloy     1  1.00±0.00   1.00±0.00   1.00±0.00 0
copper_coil      1  1.00±0.00   1.00±0.00   1.00±0.00 0
exposed_alloy     1  1.00±0.00   1.00±0.00   1.00±0.00 0
chrome files 195 chrome mats 304
[('places/place_aftermath_aft_cargo_module.glb', 4), ('places/place_aftermath_deb_liner_drive_pod.glb', 4), ('places/place_aftermath_deb_ore_freighter_drive_bell.glb', 4), ('places/place_aftermath_deb_ore_freighter_hopper_lid.glb', 4), ('places/place_aftermath_wreck_ore_freighter_bow__stripped.glb', 4), ('places/place_aftermath_wreck_ore_freighter_hopper.glb', 4), ('places/place_aftermath_aft_dock_collar.glb', 3), ('places/place_aftermath_aft_engine_section.glb', 3), ('places/place_aftermath_aft_weapon_spar.glb', 3), ('places/place_aftermath_deb_corvette_barbette_ring.glb', 3), ('places/place_aftermath_deb_liner_hull_panel.glb', 3), ('places/place_aftermath_wreck_liner_boatbay.glb', 3), ('places/place_aftermath_wreck_liner_bow.glb', 3), ('places/place_aftermath_wreck_liner_drum.glb', 3), ('places/place_aftermath_wreck_liner_drum__derelict.glb', 3)]
[(('signal', None, 'forge-v1'), 672), (('mechanical', None, 'forge-v1'), 467), (('hull', None, 'forge-v1'), 457), (('hull', 'painted_shell', None), 162), (('accent', None, 'forge-v1'), 112), (('warning', None, 'forge-v1'), 112), (('mechanical', 'worn_tool_metal', None), 91), (('drive', None, 'forge-v1'), 88), (('glass', None, 'forge-v1'), 87), (('ceramic', None, 'forge-v1'), 77), (('signal', None, None), 54), (('accent', 'painted_shell', None), 40), (('geology', None, 'forge-v1'), 22), (('geology', None, None), 19), (('service', 'painted_shell_worn', None), 19), (('warning', 'industrial_marking', None), 9), (('glass', 'controlled_glass', None), 7), (('ceramic', 'thermal_ceramic', None), 6), (('radiator', 'radiator_fin', None), 2), (('maintenance_mark', None, None), 1), (('heat_affected_alloy', None, None), 1), (('copper_coil', None, None), 1), (('exposed_alloy', None, None), 1)]
```
After:
```
materials 2501 files 286
role             n    r mean±sd    m mean±sd  env mean±sd chrome
signal         728  0.41±0.09   0.02±0.14   0.45±0.16 0
hull           608  0.49±0.07   0.12±0.06   1.17±0.04 0
mechanical     549  0.52±0.08   0.74±0.15   1.30±0.00 0
accent         151  0.46±0.09   0.10±0.07   1.13±0.04 0
warning        121  0.51±0.03   0.05±0.03   0.99±0.05 0
glass           99  0.07±0.04   0.01±0.03   1.01±0.03 0
drive           88  0.41±0.05   0.00±0.00   0.60±0.00 0
ceramic         83  0.72±0.06   0.00±0.00   0.71±0.03 0
geology         41  0.94±0.05   0.07±0.07   1.00±0.00 0
service         19  0.74±0.16   0.42±0.23   1.30±0.00 0
rubber          12  0.70±0.00   0.01±0.02   0.56±0.02 0
radiator         2  0.50±0.00   0.35±0.00   1.30±0.00 0
chrome files 0 chrome mats 0
[]
[(('signal', None, 'forge-v1'), 672), (('mechanical', None, 'forge-v1'), 466), (('hull', None, 'forge-v1'), 456), (('hull', 'painted_shell', None), 152), (('accent', None, 'forge-v1'), 112), (('warning', None, 'forge-v1'), 112), (('drive', None, 'forge-v1'), 88), (('glass', None, 'forge-v1'), 87), (('mechanical', 'worn_tool_metal', None), 83), (('ceramic', None, 'forge-v1'), 77), (('signal', None, None), 56), (('accent', 'painted_shell', None), 39), (('geology', None, 'forge-v1'), 22), (('geology', None, None), 19), (('service', 'painted_shell_worn', None), 19), (('glass', 'controlled_glass', None), 12), (('rubber', 'matte_seal', None), 10), (('warning', 'industrial_marking', None), 9), (('ceramic', 'thermal_ceramic', None), 6), (('rubber', None, 'forge-v1'), 2), (('radiator', 'radiator_fin', None), 2)]
```

## Rendered before/after (286 models × 2 views)
```
models 286 B 286 A 286
meanL      0.464±0.153 -> 0.461±0.149
clipPct    5.583±9.400 -> 5.052±8.350
specPct    10.395±15.692 -> 9.948±15.161
bloomHalo  0.005±0.002 -> 0.005±0.003
contrast   0.742±0.149 -> 0.741±0.156
outliers 57 -> 58
worst12 (before) after-scores:
place_utility_module 152.0 -> 107.6
cockpit_dome 138.7 -> 141.0
place_cargo_pod_hazmat 101.6 -> 98.0
place_comms_array 94.8 -> 95.8
place_construction_frame 88.2 -> 60.2
place_habitat_pod 90.8 -> 87.6
engine_plasma_ring 86.8 -> 87.0
place_cargo_pod_standard_breached 85.5 -> 86.3
place_habitat_pod_derelict 81.2 -> 65.3
engine_vector 81.0 -> 81.8
place_parts_rack 78.0 -> 72.3
pod_utility 78.3 -> 79.1
```
Outlier = any view with spec% > 25 or clip% > 15.

## Honest result
The material bands clear the static spread (chrome 304 → 0, mechanical env sd 0.35 → 0) but the **rendered** look barely moves:
outliers 57 → 58, clip 5.58 → 5.05 %, spec 10.40 → 9.95 %. The worst-12 sheet is visibly unchanged on the cream hulls.
The material-factor layer is not the main source of the blown look. The pale value is coming from the illustrated surface
/ livery pigment and texture path, and from exposure/tone mapping, not from `material.color`. Next lever (not done here):
cap the pigment value in `illustratedLivery`/`illustratedSurface` and review env intensity/exposure in the renderer.
That overlaps #220 (bloom/renderer).

## Overlaps
- #226 renderPackageDigest: not touched. Rebuilt package runtime tables will conflict on regenerated manifests; rebuild after merging.
- #221 assets/ships/parts: not touched.
- #220 bloom/renderer: not touched. Tone-mapping work belongs there.

Sheets (box): `/workspace/look-unify/all_before.png`, `all_after.png`, `worst12_before_after.png`.
