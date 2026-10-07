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

## Pass 2, step 1: cause A/B (one factor at a time)
Models: cockpit_dome, place_cargo_pod_hazmat, place_habitat_pod, place_utility_module. Inspect view, live renderer, bloom on.
Metric: share of lit pixels (L > 0.18) that clip (any channel 255) = c, and that are white specular (L > 0.85, sat < 0.25) = s.
Bench: `scripts/fleet-look.mjs --tune / --post / --lights / --ab` (the `--ab` switch was added on this branch).

| run | change |
|---|---|
| v0 | baseline (pass 1) |
| v1 | surface.paintCeiling 0.74 → 0.45 |
| v2 | clear coat off |
| v3 | exposure 0.7 |
| v4 | rig key/rim/fill halved |
| v5 | illustrated off (no effect: flag not honoured on parts) |
| v6 | albedoGamma 1.0 |
| v7 | bloom off |
| v8 | exposure 0.4 |
| v9 | all rig lights 0 |
| va | grade/toe/vignette 0 |
| vb | material.envMapIntensity × 0 |
| vc | emissive × 0 |
| vd | scene.environment off + rig 0 |
| ve | base colour × 0.5 |
| vf | **scene.environment off** (rig unchanged) |
| vg | env off + rig 0 + emissive 0 |

```
v0         cockpit_dome_i c 70.4 s 72.1 L0.84 | place_cargo_po c 39.9 s 62.9 L0.87 | place_habitat_ c  8.1 s 45.6 L0.79 | place_utility_ c 35.7 s 72.4 L0.88
v1         cockpit_dome_i c 70.4 s 72.2 L0.84 | place_cargo_po c 32.8 s 43.8 L0.84 | place_habitat_ c  5.7 s 17.1 L0.75 | place_utility_ c 26.9 s 53.6 L0.85
v2         cockpit_dome_i c 69.4 s 70.6 L0.83 | place_cargo_po c 38.7 s 60.0 L0.86 | place_habitat_ c  7.8 s 44.1 L0.78 | place_utility_ c 34.2 s 70.8 L0.87
v3         cockpit_dome_i c 72.1 s 72.9 L0.84 | place_cargo_po c 35.6 s 41.4 L0.82 | place_habitat_ c  7.1 s 13.7 L0.74 | place_utility_ c 30.7 s 47.8 L0.84
v4         cockpit_dome_i c 70.4 s 72.2 L0.84 | place_cargo_po c 38.4 s 54.2 L0.81 | place_habitat_ c  8.0 s 36.7 L0.72 | place_utility_ c 34.1 s 64.7 L0.84
v5         cockpit_dome_i c 70.3 s 72.1 L0.84 | place_cargo_po c 39.9 s 62.9 L0.87 | place_habitat_ c  8.1 s 45.6 L0.79 | place_utility_ c 35.7 s 72.4 L0.88
v6         cockpit_dome_i c 70.3 s 72.0 L0.84 | place_cargo_po c 39.0 s 61.1 L0.86 | place_habitat_ c  8.0 s 44.5 L0.79 | place_utility_ c 34.9 s 70.7 L0.87
v7         cockpit_dome_i c 73.2 s 76.4 L0.82 | place_cargo_po c 30.7 s 61.0 L0.86 | place_habitat_ c  5.1 s 45.9 L0.79 | place_utility_ c 21.8 s 72.1 L0.87
v8         cockpit_dome_i c 73.8 s 74.4 L0.84 | place_cargo_po c 27.2 s 30.3 L0.73 | place_habitat_ c  5.2 s  7.1 L0.62 | place_utility_ c 23.0 s 29.7 L0.75
v9         cockpit_dome_i c 71.0 s 72.7 L0.84 | place_cargo_po c 37.2 s 43.0 L0.74 | place_habitat_ c  7.8 s 23.5 L0.60 | place_utility_ c 32.9 s 63.5 L0.78
va         cockpit_dome_i c 70.0 s 71.7 L0.85 | place_cargo_po c 31.5 s 61.4 L0.87 | place_habitat_ c  6.5 s 41.3 L0.79 | place_utility_ c 29.8 s 70.0 L0.87
vb         cockpit_dome_i c 70.4 s 72.2 L0.84 | place_cargo_po c 39.9 s 62.9 L0.87 | place_habitat_ c  8.1 s 45.7 L0.79 | place_utility_ c 35.8 s 72.4 L0.88
vc         cockpit_dome_i c  3.4 s 13.8 L0.68 | place_cargo_po c 40.0 s 63.0 L0.87 | place_habitat_ c  8.1 s 45.7 L0.80 | place_utility_ c 35.7 s 72.5 L0.88
vd         cockpit_dome_i c 76.9 s 76.9 L0.84 | place_cargo_po c  0.0 s  0.0 L0.24 | place_habitat_ c  0.0 s  0.0 L0.28 | place_utility_ c  1.9 s  0.0 L0.24
ve         cockpit_dome_i c 71.2 s 72.8 L0.84 | place_cargo_po c 27.6 s 38.8 L0.79 | place_habitat_ c  2.4 s  6.7 L0.51 | place_utility_ c 23.7 s 45.2 L0.80
vf         cockpit_dome_i c 75.6 s 75.6 L0.83 | place_cargo_po c  0.0 s  0.2 L0.51 | place_habitat_ c  0.0 s  0.0 L0.58 | place_utility_ c  0.6 s  0.0 L0.52
vg         cockpit_dome_i c  0.0 s  0.0 L0.28 | place_cargo_po c  0.0 s  0.0 L0.24 | place_habitat_ c  0.0 s  0.0 L0.28 | place_utility_ c  0.0 s  0.0 L0.22
```

**Findings**
- **Cream hulls: the image-based environment light (`scene.environment`, the foundry HDRI normalized to mean radiance 1.0) causes the blowout.**
  Removing it alone (vf) takes clip from 36–40% to 0–0.6% and spec from 45–72% to ≈0, with shading intact (L 0.51–0.58).
  Everything else moves it only partly. Rig lights at 0 (v9) still clip about 33%. Exposure 0.4 (v8) still clips 23–27%.
  Halving base colour (ve) still clips 24–28%. Coat, bloom, grade, gamma and paint ceiling each cut less than 10 points.
- **Why pass 1 and `envMapIntensity` did nothing (vb is identical to v0):** these materials have `envMap === null` and use
  `scene.environment`. In this three.js build, `WebGLRenderer` then sets `envMapIntensity = scene.environmentIntensity` (1.0)
  and ignores `material.envMapIntensity`. So every authored and role-band env value is dead in the live renderer.
- **Cockpit dome: emissive causes it.** Glass is emissive #d3eaff × 2.2. Emissive × 0 (vc) takes the dome from clip 70% to 3%.
- No unlit or toon path is involved: every hull runs through the illustrated physical shader.

## Pass 2: fix and rendered result
**Fix (shared layer, no bloom.js/renderer.js edits):**
- `illustratedSurface.js`: hulls now honour the authored/role `envMapIntensity` under `scene.environment`, through a per-material
  `sfAuthoredEnv` uniform, and scale it by a new Look value `surface.sceneEnv` (`look.js`, `lookMoods.js`).
  LOOK_BASE `sceneEnv` is 0.18, picked from an A/B sweep (1.0 / 0.35 / 0.20 / 0.10). Moods can override it. Program key is unchanged.
- `materialRoleBands.js`: glass emissive is capped at 0.25. The cockpit dome now reads as glass, not as a glow blob.
- Signal and drive emissive are untouched, so glow parts still bloom. Livery colour factors are untouched (livery test passes).
  Exposure and tone mapping are untouched.

**Rendered, 286 models × 2 views, master → pass 2:**
```
models 286
meanL      0.464±0.153 -> 0.357±0.140
clipPct    5.583±9.400 -> 2.399±4.591
specPct    10.395±15.692 -> 0.748±3.702
bloomHalo  0.005±0.002 -> 0.004±0.002
contrast   0.742±0.149 -> 0.586±0.161
sat        0.367±0.110 -> 0.437±0.117
outliers 57 -> 7
still: cockpit_dome fin_crystalline place_station_billboard place_traffic_signal pod_utility weapon_heavy_cannon weapon_railgun
per dominant role: meanL sd / spec mean  before -> after
  accent      n= 13 L sd 0.127->0.140  spec  14.8->  0.3  clip  15.6->  9.1
  ceramic     n=  9 L sd 0.088->0.068  spec   4.6->  0.1  clip   2.0->  0.2
  geology     n= 13 L sd 0.120->0.108  spec   4.1->  0.1  clip   1.6->  0.4
  hull        n= 84 L sd 0.169->0.157  spec  18.1->  1.1  clip   5.3->  1.9
  mechanical  n= 71 L sd 0.149->0.135  spec   9.0->  1.3  clip   7.0->  2.0
  service     n= 12 L sd 0.056->0.059  spec   6.0->  0.1  clip   0.5->  0.0
  signal      n= 80 L sd 0.112->0.093  spec   5.5->  0.2  clip   4.9->  3.2
worst12 spec+clip:
  place_utility_module 152.0 -> 11.2
  cockpit_dome 138.7 -> 66.4
  place_cargo_pod_hazmat 101.6 -> 7.7
  place_comms_array 94.8 -> 27.4
  place_habitat_pod 90.8 -> 8.1
  place_construction_frame 88.2 -> 1.4
  engine_plasma_ring 86.8 -> 2.4
  place_cargo_pod_standard_breached 85.5 -> 4.9
  place_habitat_pod_derelict 81.2 -> 7.3
  engine_vector 81.0 -> 15.9
  pod_utility 78.3 -> 79.0
  place_parts_rack 78.0 -> 2.3
```
Targets:
- outliers ≤ 10: **met** (57 → 7).
- spec halved: **met** (10.4 → 0.75%).
- clip ≤ 1.5%: **missed** (5.58 → 2.40%). The remainder is mostly emissive glow (accent 9.1%, signal 3.2%), which the brief keeps bright.
  Hull 1.9%, mechanical 2.0%.
- meanL 0.38–0.42: **slightly under** (0.357).

The remaining 7 outliers are the cockpit_dome glass rim highlights, glow-heavy parts (pod_utility, place_traffic_signal,
place_station_billboard, fin_crystalline) and two weapons.

**Known side effect:** cream paint used to get its warmth from the warm foundry IBL. With that IBL cut, pale hulls read cool grey or
lavender under the Look's blue shadow tint (see worst12_before_after2.png). Raising `sceneEnv` to about 0.25, or warming
`surface.shadowTint`, should also bring meanL into 0.38–0.42. That change is not rendered yet.

Sheets (box): `/workspace/look-unify/all_after2.png`, `/workspace/look-unify/worst12_before_after2.png` (BEFORE = master).

## Pass 3: restore cream, lift luminance
A/B on pale and worst models (inspect view). c = clip %, s = white-spec %, L = mean luminance over lit pixels,
w = warmth (R − B, 0–255) of pale pixels; negative means cool.

| run | change |
|---|---|
| b18 | pass 2 (sceneEnv 0.18) |
| e22 / e25 / e30 | sceneEnv 0.22 / 0.25 / 0.30 |
| t1 | sceneEnv 0.25 + surface.shadowTint [0.80, 0.76, 0.82] |
| t2 | t1 + post.shadowTint neutral |
| t3 | post.shadowTint neutral only |
| t4 | sceneEnv 0.25 + neutral grey ambient light |
```
b18  _vector_insp c13.5 s 0.3 L0.60 w-10.6|cargo_pod_ha c 0.1 s 7.7 L0.72 w +2.1|comms_array_ c 0.4 s23.2 L0.75 w+12.6|habitat_pod_ c 0.0 s 4.0 L0.68 w +3.7|parts_rack_i c 0.0 s 2.3 L0.67 w-18.1|utility_modu c 2.1 s 9.0 L0.74 w -9.3
e22  _vector_insp c13.4 s 0.3 L0.61 w -6.5|cargo_pod_ha c 0.1 s12.1 L0.74 w +5.7|comms_array_ c 0.4 s31.7 L0.76 w+14.4|habitat_pod_ c 0.0 s 7.2 L0.69 w +7.4|parts_rack_i c 0.0 s 3.2 L0.69 w-12.6|utility_modu c 2.8 s12.8 L0.76 w -5.1
e25  _vector_insp c13.6 s 0.3 L0.63 w -3.9|cargo_pod_ha c 1.0 s15.8 L0.75 w +8.6|comms_array_ c 0.4 s32.7 L0.77 w+15.5|habitat_pod_ c 0.0 s 8.8 L0.71 w+10.4|parts_rack_i c 0.0 s 4.0 L0.71 w -6.8|utility_modu c 3.5 s15.7 L0.77 w -1.9
e30  _vector_insp c13.7 s 0.6 L0.65 w -0.2|cargo_pod_ha c 6.2 s22.6 L0.78 w+12.4|comms_array_ c 0.4 s37.1 L0.78 w+16.8|habitat_pod_ c 0.1 s14.8 L0.72 w+14.5|parts_rack_i c 1.8 s 6.2 L0.74 w +2.7|utility_modu c 8.0 s27.4 L0.80 w +3.4
t1   _vector_insp c13.6 s 0.3 L0.63 w +7.8|cargo_pod_ha c 2.4 s16.6 L0.76 w+19.4|comms_array_ c 0.4 s32.7 L0.77 w+21.4|habitat_pod_ c 0.0 s 9.8 L0.71 w+28.7|parts_rack_i c 0.4 s 4.0 L0.71 w+20.2|utility_modu c 4.3 s16.5 L0.78 w+12.6
t2   _vector_insp c13.6 s 0.3 L0.64 w+10.8|cargo_pod_ha c 2.4 s16.6 L0.76 w+20.6|comms_array_ c 0.4 s32.7 L0.77 w+21.6|habitat_pod_ c 0.0 s 9.9 L0.71 w+29.7|parts_rack_i c 0.4 s 4.0 L0.72 w+22.2|utility_modu c 4.3 s16.5 L0.78 w+13.5
t3   _vector_insp c13.5 s 0.3 L0.60 w -1.2|cargo_pod_ha c 0.1 s 7.7 L0.72 w +5.3|comms_array_ c 0.4 s23.1 L0.75 w+13.8|habitat_pod_ c 0.0 s 4.0 L0.68 w +7.2|parts_rack_i c 0.0 s 2.3 L0.67 w-10.9|utility_modu c 2.1 s 9.0 L0.74 w -6.3
t4   _vector_insp c13.6 s 0.3 L0.63 w -3.5|cargo_pod_ha c 1.0 s15.9 L0.75 w +8.9|comms_array_ c 0.4 s32.7 L0.77 w+15.7|habitat_pod_ c 0.0 s 8.8 L0.71 w+10.8|parts_rack_i c 0.0 s 4.0 L0.71 w -6.4|utility_modu c 3.5 s15.7 L0.77 w -1.6
```
**Why hulls read cool:** `LOOK_BASE.surface.shadowTint` [0.64, 0.72, 1.12] multiplies the unlit diffuse with ultramarine.
Before pass 2 the bright, warm-neutralized IBL masked it. Once the IBL was cut, it dominated pale paint.
- Warming it (t1) moves pale-pixel warmth from −7…+10 to +13…+29, which reads as cream.
- The post grade tint (t3, about +3) and the ambient colour (t4, about 0) barely matter.
- The HDR is not the cause: it is already neutralized.
- sceneEnv lifts luminance, but spec rises with it (utility 9 → 16 → 27 % for 0.18 → 0.25 → 0.30).

**Pick:** sceneEnv 0.22 + surface.shadowTint [0.80, 0.76, 0.82] in LOOK_BASE. Moods keep their own tints.
