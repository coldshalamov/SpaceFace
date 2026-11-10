# Helios model remaster inventory

Handoff snapshot: **2026-09-19 — 68 GLB families / 86 source GLB files, plus five common procedural rock shapes.**
Counts include separate external LOD files where listed; embedded LOD meshes are not additional files.
All 68 GLB families and five common procedural rock shapes have passed root art review.
All 86 authored source files are promoted through compressed releases and compiled render packages.
The final scoped check verified all 86 source/release/pilot/package/runtime hash bindings, with
no missing files or files above 100 MiB. The trade hub uses its accepted compact source and
the compiler's standard shipping normal/tangent filter for compact package storage.

| Packet / authoring owner | Families / files | Durable authoring and contracts | Root visual status at this handoff |
| --- | ---: | --- | --- |
| Hero and traffic / hero fleet lane | 14 / 26 | [hero_fleet.py](hero_fleet.py), [source pins](hero_fleet_sources.json), [component preflight](hero_fleet_preflight.json), [receipt generator](hero_fleet_receipt.mjs), [notes](HERO_FLEET.md) | Accepted. |
| Occupational craft / working fleet lane | 8 / 8 | [working_fleet.py](working_fleet.py), [review contract](working_fleet.json), [notes](working_fleet.md) | All eight accepted. |
| Places, equipment and wrecks / sector places lane | 33 / 33 | [sector_places.py](sector_places.py), [aftermath construction](sector_places_aftermath.py), [exact source/candidate contract](sector_places.contract.json), [metadata correction](sector_places.metadata-repair.json), [hub storage compaction](trade_hub_compact.json), [notes](SECTOR_PLACES.md) | All 33 accepted and integrated, including corrected identity metadata and compact hub storage. |
| Convoy and faction variants / hero fleet lane | 8 / 12 | [additional_fleet.py](additional_fleet.py), [source pins](additional_fleet_sources.json), [component preflight](additional_fleet_preflight.json), [receipt generator](additional_fleet_receipt.mjs), [notes](ADDITIONAL_FLEET.md) | All eight accepted, including the final MTS Span, MTS Wasp and SCN Wasp revisions. |
| Warden and exact hostile variants / sector places lane | 4 / 6 | [warden.py](warden.py), [source pins](warden.sources.json), [exact source/candidate and review contract](warden.contract.json), [notes](WARDEN_HOSTILES.md) | Warden and all three hostile bodies accepted after second construction pass. |
| Surveyed seamed rock / geology lane | 1 / 1 | [geology.py](geology.py), [shipping-geometry host bridge](geology.host.mjs), [contract](geology.json), [notes](geology.md) | Accepted; final source hash begins `799ca`. |
| Common procedural rocks / root rendering lane | 5 shapes / no GLB | [visualFactory.js](../../../src/render/visualFactory.js), [objectSpaceGeology.js](../../../src/render/objectSpaceGeology.js) | Five shapes reviewed and accepted in the shared scene. |

## Exact ship source set

Every filename in this section is under **`assets/ships/parts/wholeships/`**.
`{,_lod1,_lod2}` is filename notation for exactly three files, not an instruction to regenerate other variants.

| Hero / traffic family | Source file(s) |
| --- | --- |
| Hitch / Kestrel | `kestrel{,_lod1,_lod2}.glb` |
| Lark | `helios_lark.glb` |
| Cradle | `helios_cradle.glb` |
| Span | `helios_span.glb` |
| Base Ashline Rig | `ashline_rig.glb` |
| Survey Pin | `survey_pin.glb` |
| Massline liner | `massline_express_liner_v1{,_lod1,_lod2}.glb` |
| Arclight | `helios_arclight.glb` |
| Volatiles tanker | `volatiles_tanker.glb` |
| Inspection cutter | `inspection_cutter.glb` |
| Wasp | `wasp_production_v1{,_lod1,_lod2}.glb` |
| Hornet | `hornet_production_v1{,_lod1,_lod2}.glb` |
| Bastion | `bastion_production_v1{,_lod1,_lod2}.glb` |
| Drifter | `drifter_production_v1{,_lod1,_lod2}.glb` |

Working fleet: `repair_tender.glb`, `rescue_lifter.glb`, `prospector_skiff.glb`,
`scrap_sweeper.glb`, `apron_shuttle.glb`, `salvage_cutter.glb`, `yard_tug.glb`, `ore_barge.glb`.
All eight use their existing single source file with native LOD groups.

| Additional family | Source file(s) | Root status |
| --- | --- | --- |
| Mule | `mule_production_v1{,_lod1,_lod2}.glb` | Accepted |
| Atlas | `atlas_production_v1{,_lod1,_lod2}.glb` | Accepted |
| DMC Span | `helios_span_dmc.glb` | Accepted |
| Reach Span | `helios_span_reach.glb` | Accepted |
| Free Militia Wasp | `wasp_free_militia.glb` | Accepted |
| MTS Span | `helios_span_mts.glb` | Accepted |
| MTS Wasp | `wasp_mts_escort.glb` | Accepted |
| SCN Wasp | `wasp_scn_patrol.glb` | Accepted |

Warden/hostiles: `warden_production_v1{,_lod1,_lod2}.glb`, `ashline_dart.glb`,
`ashline_lode.glb`, `ashline_rig_corsair_blade.glb`. These hostile files are the selected
un-suffixed bodies and the actual Corsair variant, not the separately existing Dart/Lode
production hulls or the base Rig. All four families are accepted; the three hostile bodies now
have connected primary construction, with unchanged distant material draw counts.

## Exact nonship source set

The sector places lane owns the following **19** files under **`assets/ships/parts/places/`**:

```text
place_station_trade_hub.glb
var_station_trade_hub_scn_overlay_v01.glb
place_station_military.glb
place_gate_jump_ring.glb
place_lane_beacon.glb
place_memorial_array.glb
place_lane_pin.glb
place_tally_post.glb
place_claim_mark.glb
place_cold_locker.glb
place_ash_pin.glb
place_whistle.glb
place_mining_drone.glb
place_47a_rescue_capsule.glb
place_dead_hulk.glb
place_debris_chunk.glb
place_nav_buoy.glb
place_station_billboard.glb
place_dock_interior.glb
```

Two under **`assets/ships/parts/pods/`**: `pod_47a_evidence_spindle.glb`, `pod_cargo_container.glb`.

Six under **`assets/ships/parts/weapons/`**: `weapon_gatling.glb`, `weapon_turret_dual.glb`,
`weapon_railgun.glb`, `weapon_heavy_cannon.glb`, `weapon_lance.glb`, `weapon_pulse_cannon.glb`.

Six aftermath families use the editable pack sources below, rather than direct replacement of generated place releases:

| Runtime family | Source under `assets/incubator/wreck_aftermath_pack/source/` |
| --- | --- |
| `place_aftermath_aft_engine_section` | `aft_engine_section.glb` |
| `place_aftermath_aft_cockpit_section` | `aft_cockpit_section.glb` |
| `place_aftermath_aft_cargo_module` | `aft_cargo_module.glb` |
| `place_aftermath_wreck_corvette_turret` | `wreck_corvette_turret.glb` |
| `place_aftermath_aft_weapon_spar` | `aft_weapon_spar.glb` |
| `place_aftermath_aft_pressure_tank` | `aft_pressure_tank.glb` |

The separate named-rock source is **`assets/ships/parts/places/place_asteroid_seamed.glb`**;
its surfaced scene target is **`assets/ships/parts/blender/place_asteroid_seamed_authored.blend`**.
The five common rocks come from `ast_common_rock` in the shipping visual factory; rescue-rock aliases
share that family. The host bridge imports that actual geometry into the named-rock authoring recipe.

## Reproduction and integration entry points

Use the owned recipes linked above. Their notes give candidate directories, pinned source rules and
Blender selection arguments. Representative commands from the repository root:

```text
blender --background --threads 3 --python tools/blender/helios_remaster/hero_fleet.py -- --build --lods
blender --background --threads 3 --python tools/blender/helios_remaster/working_fleet.py -- --only repair_tender
node tools/blender/helios_remaster/sector_places.prepare.mjs
blender --background --threads 3 --python tools/blender/helios_remaster/sector_places.py -- --build place_lane_pin
blender --background --threads 3 --python tools/blender/helios_remaster/additional_fleet.py -- --build --lods
blender --background --threads 3 --python tools/blender/helios_remaster/warden.py -- --build
node tools/blender/helios_remaster/geology.host.mjs
blender --background --threads 3 --python tools/blender/helios_remaster/geology.py
```

Exact candidate hashes come from the linked contracts and the hero/additional receipt generators;
their generated promotion maps live in the corresponding `.devshots/helios-remaster/*/promotion.json`.
The Warden [receipt command](warden.receipt.mjs) is `node tools/blender/helios_remaster/warden.receipt.mjs`.
Candidate regeneration requires a fresh root verdict; a receipt does not establish visual quality.

Root owns copying accepted candidates through those source mappings, then refreshing the selected
manifest rows, release assets and compiled packages. Entry points: [source release build](../../../scripts/build-sg04-release-assets.mjs),
[pack release build](../../../scripts/build-pack-release-assets.mjs), [pilot refresh](../../../scripts/refresh-render-package-pilots.mjs),
and [compiled package build](../../../scripts/build-render-package-pilots.mjs). Commands:

```text
node tools/blender/helios_remaster/refresh_manifest.mjs --files=<parts-relative-source-files>
node scripts/build-sg04-release-assets.mjs --no-clean --only=<releaseAssetIDs>
node scripts/refresh-render-package-pilots.mjs --only=<pilotIDs-or-keys>
node scripts/build-render-package-pilots.mjs --only=<pilotKeys>
node scripts/check-parts-manifest.mjs
node scripts/check-render-package-pilots.mjs
```

The [manifest refresher](refresh_manifest.mjs) accepts explicit primary source paths such as
`wholeships/repair_tender.glb,places/place_lane_pin.glb`. The bounded aftermath pack build is:

```text
node scripts/build-pack-release-assets.mjs --only=place_aftermath_aft_engine_section,place_aftermath_aft_cockpit_section,place_aftermath_aft_cargo_module,place_aftermath_wreck_corvette_turret,place_aftermath_aft_weapon_spar,place_aftermath_aft_pressure_tank
```

Publish the compiled package and derive its distance family from the selected visual file through
`RENDER_PACKAGE_PILOTS`; there is no additional manual packaged-live allowlist edit. Legacy procedural
source generators are not the reproduction path for these accepted models. The metadata correction
contract records the intentional gun tint replacements and inherited signal-lens normal omissions;
root owns their manifest disposition and the final integration result.

## Integrated storage and runtime results

- All 86 source/release/package bindings agree. Fourteen additional external LOD siblings are
  now release-built, packaged and admitted from the generated runtime manifest. Faction bodies
  retain their own livery instead of switching to the base model at distance.
- The trade hub source is 82,073,572 bytes. Its compiled package is 86,462,576 bytes, down from
  115,041,108 after the compiler's oversized-static-package fallback. Positions, UVs, indices,
  node/material metadata and embedded textures are unchanged by that fallback. The existing EXT
  Meshopt shipping filters introduce at most 0.722 degrees of additional normal error and 0.925
  degrees of tangent error; both NodeIO and the actual Three.js runtime decoder were checked.
  Ordinary packages remain byte-identical and animated packages never receive this fallback.
- Kestrel's release is 34,559,016 bytes versus the previous 16,031,316. All 32 source images,
  resolutions and mip counts are retained. The existing release profile changes 22 color/ORM/decal
  encodes from ETC1S to UASTC; this explains 99.37% of the growth. That quality setting is retained.
  Geometry rises from 36,902 to 40,468 triangles. Do not disguise the older ETC1S payloads as UASTC
  entries in the texture cache.
- In actual 1440×900 DPR1 flight, native thrust and firing produced the folded wake and live
  projectile pool (five simultaneous bolts observed). The original galaxy and ringed planet remain.
  GPU timing of the four-tap shadow treatment added approximately 0.44 ms to the composite.
- A calmer settled-flight window measured 11.32 ms median / 15.21 ms p95 GPU work, with 16.8 ms
  p95 frame interval. A busy thrust/fire window measured 22.34 / 42.57 ms GPU work and 100 ms
  p95 frame interval. The nearby host-load sample was 84% CPU with about 30.7/32.3 GiB RAM used.
  These measurements retain identical viewport/default quality; they are not a universal 60 fps
  claim. Diagnostic background/material/shadow bypasses were restored and are not shipping settings.

Focused renderer/VFX checks passed (80 tests), final distance-family/surface checks passed (18),
and storage/compiler checks passed (17). The final Electron playable route passed all 16 checks:
launch, authored hulls, world, native thrust, save/Continue, no uncaught or shader errors, and all
asset requests served. Local timing details are in
`.devshots/helios-remaster/final-ink-cost.json`, `final-layer-isolation.json`,
`final-idle-perf.json` and `final-thrust-perf.json`.

Two broader legacy validators remain red: parts-manifest reports 48 inherited metadata/schema
failures, and SG04's catalog-count assertion expects 167 entries while the shared release manifest
now contains 258. The latter already failed at 244 before this campaign's fourteen LOD additions.
Those are not replaced by fabricated texture data or changed expected counts. The scoped 86-asset
hash check is green; broader catalog cleanup remains separate work.

## Individual-model work outside this first-sector pass

- Pelican, Ironback, Ranger, Colossus and Leviathan were outside the default Helios model set and
  have not received this campaign's individual construction pass.
- Other sectors' authored stations, landmarks and geology remain individual work. Known excluded
  rocks include `place_asteroid_rock_a`, `place_asteroid_rock_b`, `place_asteroid_rock_c` and
  `place_asteroid_graffiti` under `assets/ships/parts/places/`.
- Procedural faction ships outside the listed selected bodies still need individual construction
  review and modeling where weak. The shared lighting, surface treatment and VFX direction apply
  globally; that does not confer individual-model acceptance on the remaining world.

Future agents should continue from the live visual selection and exact source manifest for the
next sector, retaining useful authored models. This list deliberately does not invent a complete
outside-sector census or reopen the accepted Helios packets.
