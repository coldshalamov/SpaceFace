<!-- LIFETIME: DURABLE -->
# Hull triage — 2026-08-24 (PQ-136.03)

```yaml
packet: PQ-136.03
base: 490fc986
exitGate: Every authored hull has a disposition on the record.
writeSet:
  - design/graphics-sprints/VISUAL_ASSET_CATALOG.md
  - design/graphics-sprints/HULL_TRIAGE_2026-08-24.md
```

This is the disposition record for every authored SpaceFace hull. It extends
[VISUAL_ASSET_CATALOG.md](./VISUAL_ASSET_CATALOG.md); it does not replace it and it
does not accept art. No asset was moved, deleted, rewired, or promoted.

## How identities were counted

A **hull identity** is one ship at one campaign generation:

- LOD0/1/2 of the same generation collapse to one row.
- Source GLB + release GLB + matching Blender of the same generation collapse to one row.
- An authoring tree whose bytes match the live parts file (Helios civilian, the eleven
  work-fleet re-authors) is the live identity, not a second ship.
- A later factory remaster that is **not** the live selector (`*_production_v1` Ashline /
  Helios / work-fleet) is a separate identity.
- Hitch/Kestrel extras are listed so nothing is abandoned on disk, but they are not
  proposed as replacements. Hitch stays frozen.

Not counted as hulls (the 852-of-1412 filename-grep failure class):

- wreck/prop incubator packs (PQ-136.00 / .01)
- stations, places, kit greebles, weapons, engines, cockpits, scenery
- third-party Kenney / Quaternius kit trees (Quaternius Insurgent/Pancake/Striker are
  named as reference donors on the Ashline v2 rows, not as SpaceFace hulls)

## Headline counts

| Bucket | Count |
|---|---:|
| Hull identities walked | **90** |
| already-live | **38** |
| FIELD | **4** |
| VARIANT | **12** |
| RESERVED | **31** |
| CANNOT-USE | **5** |

## Ten highest-value FIELD / VARIANT

Ranked by player-facing variety per unit of work. Hitch is excluded.

| Rank | Identity | Disposition | Slot | Cheapest path |
|---:|---|---|---|---|
| 1 | Foundry Corsair Blade | FIELD | `corsair_raider` (today aliases Ashline Rig) | Faction kit already built on the live Rig; give Corsair its own body. PQ-050.15. |
| 2 | Foundry Reaver Hook | VARIANT | `reaver_pirate` | Pirate-side kit on the same Rig so Reaver and Corsair stop matching. PQ-050.15. |
| 3 | Helios Arclight | VARIANT | Helios heavy among hauler/Atlas traffic — do not steal `hauler` or Atlas | Unique hero hauler with no live sibling. Needs a presentation identity, then the normal release lane. |
| 4 | Volatiles tanker | FIELD | `tanker` (mapped and packaged; omitted from spawn on purpose) | Chase-camera still review, then let the existing role roll. PQ-136.02 hold. |
| 5 | Yard tug | FIELD | `tug` (same hold) | Same as tanker. 2026-08-18 stills called it a missing-hull kit; enclose, then spawn. |
| 6 | Inspection cutter | FIELD | `customs` ambient traffic (not the live enemy `customs_cutter`) | Same hold. Enemy id stays Hornet; this body is the unarmed inspector. |
| 7 | Helios Span faction kits (MTS / DMC / Reach) | VARIANT | `hauler` | Foundry overlays on the accepted Span. Cheapest faction variety on the most-seen civilian. |
| 8 | Wasp militia / escort / patrol kits | VARIANT | `patrol` / `escort` | Foundry faction kits on the live Wasp. |
| 9 | Incubator `salvage_cutter_damaged` | VARIANT | wreck / derelict of the live salvage cutter | Damage/wreck conversion; pairs with PQ-136.00 wreck placement. |
| 10 | Incubator `construction_rig` | VARIANT | new construction occupational (no role today) | Only occupational silhouette with no re-authored sibling. Enclosed-hull pass from the donor, then a construction role. PQ-136.02 leftover. |

## Could not resolve

Nothing in the SpaceFace-authored hull set has unknown provenance.

Named exclusions, not unknowns:

- Third-party Kenney space-kit and Helios v3 trees were not walked as hulls.
- Quaternius Ultimate Spaceships (Insurgent / Pancake / Striker) are CC0 reference
  donors of Ashline v2, not SpaceFace hulls.
- Wreck-aftermath and everyday-space-kit models belong to PQ-136.00 / .01.
- The deleted 2026-08-12 Grok clone and the deleted 2026-08-17 `SpaceFace-archives`
  parking lot are gone; the rejected July-21 Ashline v1 depth polish is not restored.

## Disposition key

| Token | Meaning |
|---|---|
| already-live | Reachable from a current selector, kit slot, or packaged traffic/hostile map. Live is not an art pass. |
| FIELD | A concrete slot exists today. Name it. |
| VARIANT | Cheapest conversion: faction kit, damage pass, wreck, or enclosed-hull re-author of a donor silhouette. |
| RESERVED | Named by an admitted plan, or Hitch-frozen, or a source-only donor that must not be copied wholesale. |
| CANNOT-USE | Evidence, not taste: live loader block, duplicate of a better sibling, or closed accessory-only hull. |

---

## A. Modular kit hulls (10)

All ten are in `parts_manifest.json`, `release_manifest.json`, and
`PART_LIBRARY_CONTRACT.slots.hull`. NPC Hitch still uses the modular path.

| Identity | Path / assetId | Family | Status | Evidence | Disposition | Absorb |
|---|---|---|---|---|---|---|
| `hull_starter` | `assets/ships/parts/hulls/hull_starter.glb` (`hull_starter`) | Kit / Hitch | live | release + parts row; `HULL_FILE_BY_DEF_ID.ship_kestrel`; Hitch freeze | already-live | Frozen. Do not restyle. |
| `hull_fighter` | `assets/ships/parts/hulls/hull_fighter.glb` | Kit / Wasp | live | release + parts; mapped to `ship_wasp` | already-live | Modular fallback while wholeship is live. |
| `hull_miner` | `assets/ships/parts/hulls/hull_miner.glb` | Kit / Pelican, Ironback | live | release + parts; `ship_pelican`, `ship_ironback` | already-live | Modular fallback. |
| `hull_freighter` | `assets/ships/parts/hulls/hull_freighter.glb` | Kit / Mule, Atlas | live | release + parts; `ship_mule`, `ship_atlas` | already-live | Modular fallback. |
| `hull_interceptor` | `assets/ships/parts/hulls/hull_interceptor.glb` | Kit / Hornet | live | release + parts; `ship_hornet` | already-live | Modular fallback. |
| `hull_corvette` | `assets/ships/parts/hulls/hull_corvette.glb` | Kit / Bastion | live | release + parts; `ship_bastion` | already-live | Modular fallback. |
| `hull_frigate` | `assets/ships/parts/hulls/hull_frigate.glb` | Kit / Warden | live | release + parts; `ship_warden` | already-live | Modular fallback. |
| `hull_capital` | `assets/ships/parts/hulls/hull_capital.glb` | Kit / Colossus, Leviathan | live | release + parts; `ship_colossus`, `ship_leviathan` | already-live | Modular fallback. |
| `hull_multirole` | `assets/ships/parts/hulls/hull_multirole.glb` | Kit / Drifter, Ranger | live | release + parts; `ship_drifter`, `ship_ranger` | already-live | Modular fallback. |
| `hull_gunship` | `assets/ships/parts/hulls/hull_gunship.glb` | Kit | live (unnamed) | release + parts + hull slot list; **no** `HULL_FILE_BY_DEF_ID` row. Warden (the gunship def) uses `hull_frigate`. | already-live | Stays in the kit library. A named gunship binding is optional later; not required to keep the file. |

Editable sources: `assets/ships/parts/blender/hull_*_authored.blend`.

---

## B. Live player wholeships (13)

Selector: `WHOLE_SHIP_FILE_BY_DEF_ID`. LOD families collapse to one row. Hitch is frozen.
Hornet and Drifter are wired and **not** quality-closed; that is PQ-050, not a new identity.

| Identity | Path / assetId | Family | Status | Evidence | Disposition | Absorb |
|---|---|---|---|---|---|---|
| Kestrel / Hitch | `wholeships/kestrel.glb` `SF_K0_KESTREL_BORROWED_TIME_V4` | Hitch | live | release + parts LOD family; default player; freeze | already-live | Frozen. Disposition is live only. |
| Wasp production | `wholeships/wasp_production_v1.glb` `SF_WASP_PRODUCTION_V1` | Wasp | live | release + parts `accepted` / `live_player_wasp`; player + lancer/ghost hostiles | already-live | Quality close PQ-050.12. Dedicated package owns remaster, not the factory clone. |
| Pelican production | `wholeships/pelican_production_v1.glb` `SF_PELICAN_PRODUCTION_V1` | Pelican | live | release + parts `live_player_pelican` | already-live | Quality close PQ-050.10. Dedicated package. |
| Mule production | `wholeships/mule_production_v1.glb` `SF_MULE_PRODUCTION_V1` | Mule | live (wired; no release-manifest row) | parts_manifest `live_player_mule`; def map; **absent** from `release_manifest.json` and `PACKAGED_LIVE_WHOLE_SHIP_FILES` | already-live | Quality close PQ-050.11. Dedicated package. Do not invent a second Mule. |
| Drifter production | `wholeships/drifter_production_v1.glb` `SF_DRIFTER_PRODUCTION_V1` | Drifter | live / not quality-closed | release LOD family; def map | already-live | PQ-050.02 chase-camera form. Factory tree is this identity. |
| Hornet production | `wholeships/hornet_production_v1.glb` `SF_HORNET_PRODUCTION_V1` | Hornet | live / wired candidate | def map + LOD family; **not** in release_manifest or packaged-live set | already-live | PQ-050.01. Not a second ship. |
| Ironback production | `wholeships/ironback_production_v1.glb` `SF_IRONBACK_PRODUCTION_V1` | Ironback | live (wired; unpackaged) | def map; not in release_manifest | already-live | PQ-050.04. |
| Bastion production | `wholeships/bastion_production_v1.glb` `SF_BASTION_PRODUCTION_V1` | Bastion | live (wired; unpackaged) | def map | already-live | PQ-050.05. |
| Atlas production | `wholeships/atlas_production_v1.glb` `SF_ATLAS_PRODUCTION_V1` | Atlas | live (wired; unpackaged) | def map | already-live | PQ-050.06. |
| Ranger production | `wholeships/ranger_production_v1.glb` `SF_RANGER_PRODUCTION_V1` | Ranger | live (wired; unpackaged) | def map | already-live | PQ-050.03. |
| Warden production | `wholeships/warden_production_v1.glb` `SF_WARDEN_PRODUCTION_V1` | Warden | live (wired; unpackaged) | def map | already-live | PQ-050.07. |
| Colossus production | `wholeships/colossus_production_v1.glb` `SF_COLOSSUS_PRODUCTION_V1` | Colossus | live (wired; unpackaged) | def map | already-live | PQ-050.08. |
| Leviathan production | `wholeships/leviathan_production_v1.glb` `SF_LEVIATHAN_PRODUCTION_V1` | Leviathan | live (wired; unpackaged) | def map | already-live | PQ-050.09. |

Authoring trees that **are** these live identities (not extra rows):
`assets/ships/wasp_production_v1/`, `pelican_production_v1/`, `mule_production_v1/`,
`fleet_player_bodies_v1/{hornet,drifter,ranger,ironback,bastion,atlas,warden,colossus,leviathan}/`.

---

## C. Live hostile Ashline (3)

Live selectors still point at the M4 packaged bodies, **not** `*_production_v1`.
`m4_ashline/` is the authoring family of these live files (hash drift vs parts is
export, not a second ship). Do not restore the rejected July-21 v1 depth polish.

| Identity | Path / assetId | Family | Status | Evidence | Disposition | Absorb |
|---|---|---|---|---|---|---|
| Ashline Dart | `wholeships/ashline_dart.glb` `SF_WHOLESHIP_ASHLINE_DART` | Ashline | live | release + parts; `wasp_swarmer`, `choir_zealot` | already-live | Remaster is PQ-050.13 from factory bodies + `m4_ashline_v2`, not a live swap of this file. |
| Ashline Lode | `wholeships/ashline_lode.glb` `SF_WHOLESHIP_ASHLINE_LODE` | Ashline | live | release + parts; `bruiser_brawler` and armor hostiles | already-live | PQ-050.14. |
| Ashline Rig | `wholeships/ashline_rig.glb` `SF_WHOLESHIP_ASHLINE_RIG` | Ashline | live | release + parts; **both** `reaver_pirate` and `corsair_raider` | already-live | Identity split is the Corsair/Reaver foundry variants, not a second live Rig. PQ-050.15. |

---

## D. Live Helios civilian (3)

`m4_helios_civilian/source` hashes **match** the live parts files. Same identity.

| Identity | Path / assetId | Family | Status | Evidence | Disposition | Absorb |
|---|---|---|---|---|---|---|
| Helios Lark | `wholeships/helios_lark.glb` `SF_WHOLESHIP_HELIOS_LARK` | Helios | live | release + parts; traffic `courier` | already-live | Do not replace with stopped-Lark or factory `helios_lark_production_v1`. Remaster PQ-050.16. Express is a **separate** ship (PQ-049). |
| Helios Cradle | `wholeships/helios_cradle.glb` `SF_WHOLESHIP_HELIOS_CRADLE` | Helios | live | release + parts; traffic `miner` | already-live | PQ-050.17. |
| Helios Span | `wholeships/helios_span.glb` `SF_WHOLESHIP_HELIOS_SPAN` | Helios | live | release + parts; traffic `hauler` + `mule_trader` | already-live | PQ-050.18. Faction kits are foundry variants, not replacements. |

---

## E. Live occupational work fleet (8)

Re-authored under `assets/ships/npc_work_fleet/` (byte-identical to
`parts/wholeships/*.glb`). Four landed with PQ-045; four more were mapped by
PQ-136.02 (`rescue`, `prospector`, `sweeper`, `shuttle`). Independent G1/G2/G4/G7
remain open. Live is not an art pass.

| Identity | Path / assetId | Family | Status | Evidence | Disposition | Absorb |
|---|---|---|---|---|---|---|
| Ore barge | `wholeships/ore_barge.glb` `SF_WHOLESHIP_ORE_BARGE` | Work fleet | live | release + parts; traffic `ore_carrier` | already-live | Remaster PQ-050.19. Do not key under `hauler`. |
| Repair tender | `wholeships/repair_tender.glb` `SF_WHOLESHIP_REPAIR_TENDER` | Work fleet | live | release + parts; traffic `tender` | already-live | PQ-050.20. |
| Salvage cutter | `wholeships/salvage_cutter.glb` `SF_WHOLESHIP_SALVAGE_CUTTER` | Work fleet | live | release + parts; traffic `salvor` | already-live | PQ-050.21. |
| Survey pin | `wholeships/survey_pin.glb` `SF_WHOLESHIP_SURVEY_PIN` | Work fleet | live | release + parts; traffic `surveyor` | already-live | PQ-050.22. |
| Rescue lifter | `wholeships/rescue_lifter.glb` `SF_WHOLESHIP_RESCUE_LIFTER` | Work fleet | live | release + parts; traffic `rescue`; `OCCUPATIONAL_TRAFFIC_CRAFT` | already-live | Stay on `rescue`. Quality is still open. |
| Prospector skiff | `wholeships/prospector_skiff.glb` `SF_WHOLESHIP_PROSPECTOR_SKIFF` | Work fleet | live | release + parts; traffic `prospector` (PQ-136.02) | already-live | Stay on `prospector`. |
| Scrap sweeper | `wholeships/scrap_sweeper.glb` `SF_WHOLESHIP_SCRAP_SWEEPER` | Work fleet | live | release + parts; traffic `sweeper` | already-live | Stay on `sweeper`. |
| Apron shuttle | `wholeships/apron_shuttle.glb` `SF_WHOLESHIP_APRON_SHUTTLE` | Work fleet | live | release + parts; traffic `shuttle`. **Also** standing in for `express` | already-live | Keep as `shuttle`. Express must move to the Massline liner (PQ-049), not stay on this hull. |

---

## F. Packaged occupational hulls held from spawn (3)

Presentation maps and release rows exist. `TRAFFIC_ROLES` omits them on purpose
after the 2026-08-18 still panel (tanker/tug = missing-hull kit; customs sent back
to Hornet). Slots exist today.

| Identity | Path / assetId | Family | Status | Evidence | Disposition | Absorb |
|---|---|---|---|---|---|---|
| Volatiles tanker | `wholeships/volatiles_tanker.glb` `SF_WHOLESHIP_VOLATILES_TANKER` | Work fleet | candidate | release + parts + `WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE.tanker`; **no** `TRAFFIC_ROLES.tanker` | FIELD | `tanker`. Enclose the hull, chase-camera stills, then spawn. PQ-136.02 hold. |
| Yard tug | `wholeships/yard_tug.glb` `SF_WHOLESHIP_YARD_TUG` | Work fleet | candidate | same pattern for `tug` | FIELD | `tug`. Same hold. |
| Inspection cutter | `wholeships/inspection_cutter.glb` `SF_WHOLESHIP_INSPECTION_CUTTER` | Work fleet | candidate | same pattern for `customs`. Enemy `customs_cutter` stays Hornet | FIELD | Ambient `customs` only. Do not collide with the enemy id. |

---

## G. Blocked accessory wholeships (2)

| Identity | Path / assetId | Family | Status | Evidence | Disposition | Absorb |
|---|---|---|---|---|---|---|
| Legacy Pelican | `wholeships/pelican.glb` `wholeship_pelican` | Pelican | rejected | parts_manifest `status: blocked` — accessory-only, no `Material_Hull`; no release row | CANNOT-USE | Fails the live loader. Live Pelican is `pelican_production_v1`. Keep as evidence. Never wire. |
| Legacy Wasp | `wholeships/wasp.glb` `wholeship_wasp` | Wasp | rejected | same block note | CANNOT-USE | Fails the live loader. Live Wasp is `wasp_production_v1`. Keep as evidence. Never wire. |

---

## H. Hitch-frozen extras (6)

Not replacements. Hitch/Kestrel disposition other than live is freeze / donor only.
Live Hitch is V7 polish (`parts_manifest` note). Orphan-harvest B-hitch-v9: do not
copy later uncompressed polish over the live release.

| Identity | Path / assetId | Family | Status | Evidence | Disposition | Absorb |
|---|---|---|---|---|---|---|
| Kestrel reference | `assets/ships/kestrel/kestrel_reference.glb` `ship_kestrel_reference` | Hitch | live (reference-only) | release-only row; interchange 1,844 tris | already-live | Reference interchange, not a second flyable. |
| Borrowed Time V2 | `assets/ships/kestrel_borrowed_time_v2/` | Hitch | superseded | Isolated candidate; V4 DESIGN: does not consume V2 geometry | RESERVED | Hitch freeze. Historical donor / evidence only. |
| Borrowed Time V3 | `assets/ships/kestrel_borrowed_time_v3/` | Hitch | superseded | Isolated foundation rebuild; not wired | RESERVED | Hitch freeze. Historical donor / evidence only. |
| V4 packet + Hitch polish v7/v8/v9 | `assets/ships/kestrel_borrowed_time_v4/` (source, `hitch_polish_v7` blend, source_candidates v7/v8/v9) | Hitch | candidate / superseded by live V7 | v9 source LOD0 hash matches v4 source, **not** live parts; B-hitch-v9 rejected copying V9 extras onto live | RESERVED | Hitch freeze. Orphan-harvest may rebuild the **release** from a later polish that beats live; never overwrite Hitch from PQ-050. |
| Material-truth v6 / DIE LAUGHING stencil | `kestrel_borrowed_time_v4` `material_truth_v6` + catalog `kestrel_die_laughing_stencil` | Hitch | candidate | Catalog rank 1; in-place stencil on the live ship | RESERVED | Hitch freeze. In-place marking pass only if a Hitch-owning lane takes it. Not a new hull. |
| M5 Kestrel upgrade | `assets/ships/m5_kestrel_upgrade/` | Hitch | legacy-donor | Catalog `kestrel_m5_upgrade`; isolated export | RESERVED | Hitch freeze. Component donor only. Do not reintroduce superseded geometry. User-supplied `SF_K0_Borrowed_Time_Revamp.blend` lives here and under `revamp-evidence`. |

---

## I. Ashline remaster generations that are not live (6)

| Identity | Path / assetId | Family | Status | Evidence | Disposition | Absorb |
|---|---|---|---|---|---|---|
| Ashline v2 Dart | `assets/ships/m4_ashline_v2/source/wholeships/ashline_v2_dart.glb` | Ashline v2 | candidate | Catalog rank 2; unwired; CC0 Quaternius Insurgent donor | RESERVED | PQ-050.13. Preferred remaster candidate for live Dart. |
| Ashline v2 Lode | `.../ashline_v2_lode.glb` | Ashline v2 | candidate | Catalog rank 3; Quaternius Pancake donor | RESERVED | PQ-050.14. |
| Ashline v2 Rig | `.../ashline_v2_rig.glb` | Ashline v2 | candidate | Catalog rank 4; source/candidate mirror; Quaternius Striker donor | RESERVED | PQ-050.15. Also the base for Corsair/Reaver identity split. |
| Factory Dart remaster | `wholeships/ashline_dart_production_v1.glb` + `fleet_player_bodies_v1/ashline_dart/` | Ashline factory | candidate | On disk in parts **and** release folders; **no** manifest row; **not** the live selector. Traffic was remapped away after unpackaged bodies went invisible | RESERVED | PQ-050.13 factory-body input. Do not remap traffic to it until it is manifested, packaged, and beats live Dart. |
| Factory Lode remaster | `wholeships/ashline_lode_production_v1.glb` + fleet tree | Ashline factory | candidate | same class | RESERVED | PQ-050.14. |
| Factory Rig remaster | `wholeships/ashline_rig_production_v1.glb` + fleet tree | Ashline factory | candidate | same class | RESERVED | PQ-050.15. |

---

## J. Helios factory remasters that are not live (3)

Live courier/miner/hauler were pointed at these, then pointed back, because they
were never in `release_manifest.json` and had no render package.

| Identity | Path / assetId | Family | Status | Evidence | Disposition | Absorb |
|---|---|---|---|---|---|---|
| Factory Lark remaster | `wholeships/helios_lark_production_v1.glb` + `fleet_player_bodies_v1/helios_lark/` | Helios factory | candidate | On disk; not selected; orphan-harvest B-traffic: factory loft, no `spacefaceAsset` | RESERVED | PQ-050.16. Do not stamp a release row until it beats live Lark. |
| Factory Cradle remaster | `wholeships/helios_cradle_production_v1.glb` + fleet tree | Helios factory | candidate | same class | RESERVED | PQ-050.17. |
| Factory Span remaster | `wholeships/helios_span_production_v1.glb` + fleet tree | Helios factory | candidate | same class | RESERVED | PQ-050.18. |

---

## K. Occupational factory remasters that are not live (4)

Same factory method as J, aimed at the four PQ-045 work-fleet bodies.

| Identity | Path / assetId | Family | Status | Evidence | Disposition | Absorb |
|---|---|---|---|---|---|---|
| Factory ore barge | `wholeships/ore_barge_production_v1.glb` + `fleet_player_bodies_v1/ore_barge/` | Work fleet factory | candidate | On disk; live selector stays `ore_barge.glb` | RESERVED | PQ-050.19. |
| Factory repair tender | `wholeships/repair_tender_production_v1.glb` + fleet tree | Work fleet factory | candidate | same class | RESERVED | PQ-050.20. |
| Factory salvage cutter | `wholeships/salvage_cutter_production_v1.glb` + fleet tree | Work fleet factory | candidate | same class | RESERVED | PQ-050.21. |
| Factory survey pin | `wholeships/survey_pin_production_v1.glb` + fleet tree | Work fleet factory | candidate | same class | RESERVED | PQ-050.22. |

---

## L. Factory clones of dedicated packages (3)

PQ-050 live seams: Pelican / Mule / Wasp remaster from their dedicated packages,
**not** factory clones. `fleet_player_bodies_v1/{pelican,mule,wasp}` hashes diverge
from the dedicated package **and** from the live parts file.

| Identity | Path / assetId | Family | Status | Evidence | Disposition | Absorb |
|---|---|---|---|---|---|---|
| Factory Pelican clone | `fleet_player_bodies_v1/pelican/` | Pelican | superseded | Hash ≠ dedicated package source ≠ (package source = live parts). PQ-050: dedicated builders only | CANNOT-USE | Duplicate of a better sibling (`pelican_production_v1` package). Keep as evidence. Do not promote. |
| Factory Mule clone | `fleet_player_bodies_v1/mule/` | Mule | superseded | same pattern | CANNOT-USE | Duplicate of `mule_production_v1` package. |
| Factory Wasp clone | `fleet_player_bodies_v1/wasp/` | Wasp | superseded | three-way hash split vs live 12.7 MB body vs dedicated source | CANNOT-USE | Duplicate of `wasp_production_v1` package. Factory dump is how hull triangles dropped below 800 once. |

---

## M. Foundry faction hull variants (8)

`assets/ships/foundry/fleet_breadth_20260720/variants/`. Kit greebles, scenery, station
overlays, and weapon variants are not hulls.

| Identity | Path / assetId | Family | Status | Evidence | Disposition | Absorb |
|---|---|---|---|---|---|---|
| Corsair Blade | `var_ashline_rig_corsair_blade_v01.glb` | Ashline Rig kit | legacy-donor | Catalog; variants_manifest donor = live `ashline_rig.glb` | FIELD | `corsair_raider`. PQ-050.15. |
| Reaver Hook | `var_ashline_rig_reaver_hook_v01.glb` | Ashline Rig kit | legacy-donor | Catalog; same donor | VARIANT | `reaver_pirate` faction kit so the two roles stop sharing one silhouette. PQ-050.15. |
| Span DMC orebox | `var_helios_span_dmc_orebox_v01.glb` | Helios Span kit | candidate | variants_manifest donor = live Span | VARIANT | Faction hauler (DMC). Do not replace accepted Span. |
| Span MTS sealed | `var_helios_span_mts_sealed_v01.glb` | Helios Span kit | candidate | same | VARIANT | Faction hauler (MTS). |
| Span Reach scrap | `var_helios_span_reach_scrap_v01.glb` | Helios Span kit | candidate | same | VARIANT | Faction hauler (Reach). |
| Wasp Free militia | `var_wasp_free_militia_v01.glb` | Wasp kit | candidate | hero_manifest / variant files | VARIANT | `patrol` / militia traffic. |
| Wasp MTS escort | `var_wasp_mts_escort_v01.glb` | Wasp kit | candidate | same | VARIANT | `escort`. |
| Wasp SCN patrol | `var_wasp_scn_patrol_v01.glb` | Wasp kit | candidate | same | VARIANT | Law patrol paint, still the Wasp body. |

---

## N. Express liner (2)

Map §1: stopped-Lark donors are RESERVED, not abandoned.

| Identity | Path / assetId | Family | Status | Evidence | Disposition | Absorb |
|---|---|---|---|---|---|---|
| Massline express liner v1 | `assets/ships/massline_express_liner_v1/source/wholeships/massline_express_liner_v1_lod0.glb` (LOD family) | Massline | candidate | Blend + LOD0/1/2 on disk; **not** in parts/release manifests; `express` has NO whole-ship binding (a draft apron-shuttle reskin was removed at 13e377bd; PQ-049 owns express identity) | RESERVED | PQ-049. Take the `express` slot. Never replace accepted Lark. |
| Stopped-Lark donor | `assets/ships/massline_express_liner_v1/reference/stopped_lark_iter19/` | Massline donor | reference-only | Catalog `helios_lark_stopped_remaster`; Blend + source GLB hash-pinned | RESERVED | PQ-049 reference donor. Never-runtime. Reauthor substantially; do not rename Lark. |

---

## O. Helios Arclight (1)

| Identity | Path / assetId | Family | Status | Evidence | Disposition | Absorb |
|---|---|---|---|---|---|---|
| Helios Arclight | `assets/ships/m4_hero_hauler/source/wholeships/helios_arclight.glb` `SF_WHOLESHIP_HELIOS_ARCLIGHT` | Helios hero | candidate | Catalog; isolated package; not in manifests or selectors | VARIANT | Unique Helios intersector heavy among hauler/Atlas traffic. Do not steal `hauler` (Span) or Atlas. Needs a presentation identity, then source/release/package. No admitted PQ; follow-up row, not a live swap. |

---

## P. Incubator ship-like donors (15)

`assets/incubator/npc_activity_pack/source/`. Independent 2026-08-08 verdict: KEEP as
source-only. Re-author, do not copy. Wreck/prop packs are other leaves.

| Identity | Path / assetId | Family | Status | Evidence | Disposition | Absorb |
|---|---|---|---|---|---|---|
| Donor ore barge | `npc_activity_pack/source/ore_barge.glb` | Incubator | reference-only | Hash ≠ live re-author; INTEGRATION source-only | RESERVED | Donor of live `ore_barge`. Do not copy. |
| Donor repair tender | `.../repair_tender.glb` | Incubator | reference-only | same | RESERVED | Donor of live tender. |
| Donor salvage cutter | `.../salvage_cutter.glb` | Incubator | reference-only | same | RESERVED | Donor of live salvor. |
| Donor survey pin | `.../survey_pin.glb` | Incubator | reference-only | same | RESERVED | Donor of live surveyor. |
| Donor rescue lifter | `.../rescue_lifter.glb` | Incubator | reference-only | same | RESERVED | Donor of live rescue. |
| Donor volatiles tanker | `.../volatiles_tanker.glb` | Incubator | reference-only | same | RESERVED | Donor of packaged tanker. |
| Donor prospector skiff | `.../prospector_skiff.glb` | Incubator | reference-only | same | RESERVED | Donor of live prospector. |
| Donor scrap sweeper | `.../scrap_sweeper.glb` | Incubator | reference-only | same | RESERVED | Donor of live sweeper. |
| Donor yard tug | `.../yard_tug.glb` | Incubator | reference-only | same | RESERVED | Donor of packaged tug. |
| Donor customs cutter | `.../customs_cutter.glb` | Incubator | reference-only | renamed on promotion to `inspection_cutter` (enemy id collision) | RESERVED | Donor of packaged inspection cutter. Keep the enemy id on Hornet. |
| Donor liner shuttle | `.../liner_shuttle.glb` | Incubator | reference-only | renamed on promotion to `apron_shuttle` | RESERVED | Donor of live shuttle. Not the express liner. |
| Construction rig | `.../construction_rig.glb` | Incubator | candidate | No re-authored sibling; orphan-harvest B-work-donors: primitive box/tube | VARIANT | Enclosed-hull re-author, then a construction occupational role. PQ-136.02 leftover. |
| Ore barge B | `.../ore_barge_b.glb` | Incubator | candidate | Second barge silhouette; no re-author | VARIANT | Second ore-carrier / faction barge after enclosed-hull pass. |
| Volatiles tanker B | `.../volatiles_tanker_b.glb` | Incubator | candidate | Second tanker silhouette; no re-author | VARIANT | Second tanker / faction tanker after enclosed-hull pass. |
| Salvage cutter damaged | `.../salvage_cutter_damaged.glb` | Incubator | candidate | Damage sibling; no re-author | VARIANT | Wreck/derelict of the live salvage cutter. PQ-136.00 can place it. |

---

## Checkoff

- [x] Every authored hull identity has a disposition on this record.
- [x] Hitch extras are freeze/donor only.
- [x] Stopped-Lark and Quaternius Ashline v2 donors are RESERVED, not abandoned.
- [x] Blocked Pelican/Wasp accessory shells are CANNOT-USE with loader evidence.
- [x] Factory clones of Wasp/Pelican/Mule dedicated packages are CANNOT-USE as duplicates.
- [x] Nothing was deleted, moved, or rewired.

## Still-review attempt, 2026-08-24 (controller GPU lane) — INSTRUMENT REJECTED, review deferred

Chase-camera Blender renders of the three held hulls (volatiles_tanker, yard_tug,
inspection_cutter) beside the accepted prospector_skiff were produced at
`.devshots/stillreview-20260824[-src]/`. The rig was rejected as an art instrument by its own
control: the ACCEPTED skiff renders as a bare slab because its authored value (rail cage, radiator
stack, boom) is thin dark geometry plus textures the Blender import does not carry, while the
pack's own hero-lit evidence stills show real structure. A fair play-size verdict therefore needs
an IN-GAME capture (the game's renderer, KTX2 pipeline, lighting), which requires temporarily
routing the held hulls through a dev scenario. Deferred until the GPU capture batch runs; the
8257fd9e rejection stands meanwhile, and the three hulls stay unrouted.
