# Fleet Composition Matrix — Fleet Breadth Foundry

Lane G integration blueprint. Machine-readable twin: `fleet_composition_matrix.json`.
Schema `sf-foundry-composition/1`. All tris are arithmetic from kit/variants/hero manifests.

## Before / after clone-fleet

| Before (live) | Shared visual | After (foundry) |
|---|---|---|
| SCN/MTS/DMC/Free patrol+escort | `wasp_production_v1.glb` tint only | SCN var +600 · MTS var +1448 · Free var +1468 · DMC kit pack +4360 |
| All factions hauler | `helios_span.glb` | MTS sealed +2028 · DMC orebox +4560 · Reach scrap +2296 · SCN/Free kit packs |
| All factions miner | `helios_cradle.glb` | Per-faction kit packs on cradle (DMC/Free/SCN/MTS/Quiet) — **no baked cradle vars yet** |
| All factions courier | `helios_lark.glb` | Per-faction kit packs — **no baked lark vars yet** |
| reaver_pirate == corsair_raider | `ashline_rig.glb` | reaver hook +828 · corsair blade +1332 |
| lancer_sniper / choir_zealot / quiet_ghost | production Wasp (gap) | Reach lance kit · Choir zealot kit +3998 · Quiet ghost kit +3272 + hostile map entries |
| SCN/MTS/Free trade hubs | `place_station_trade_hub.glb` | overlays SCN +2756 · MTS +4800 · Free +1752 |

### Distinguished-by axes (same role, ≥3 axes)

Same-role cells diverge on named bible contrast-table axes (see JSON `distinguishedBy`). Example **patrol**:

| Faction | Axes | Construction answer |
|---|---|---|
| SCN | Segmentation, Fasteners, Repair, Modules | Recessed torx + rail splits + color-matched plate kit (`var_wasp_scn_patrol`) |
| MTS | Segmentation, Fasteners, Paint, Modules | Clamshell fairings + hidden seals (`var_wasp_mts_escort`) |
| Free | Segmentation, Fasteners, Repair, Decals | Hand rivets + untrimmed patches (`var_wasp_free_militia`) |
| DMC | Fasteners, Repair, Cleanliness, Modules | Dome rivets + overplate + ore dust kit pack |

## Per-faction fleet lineup

### Solar Concord Navy (`faction_scn`)

- **Patrol / escort:** `var_wasp_scn_patrol_v01` — framed dorsal plates, two-tone band, recessed fasteners (bible §1).
- **Law / customs:** modular `hull_interceptor` + scn_law kit + military pulse barrel (high-sec ambient).
- **Hauler / courier / miner:** Span/Lark/Cradle donors + SCN kit language (orthogonal rails, hatch frames).
- **Military station presence:** trade-hub SCN overlay (bastions, customs booms, cladding band).
- **Wear:** high-sec skew fresh; serviceWorn default.

### Meridian Trade Syndicate (`faction_mts`)

- **Patrol / escort:** `var_wasp_mts_escort_v01` — clamshells, gold zone, conformal blisters (§2).
- **Hauler:** `var_helios_span_mts_sealed_v01` — sealed cargo clamshells + logo.
- **Courier / miner / express:** Lark/Cradle/freighter + MTS access/sensor kit; express ideally remapped to sealed Span later.
- **Hub:** MTS commerce rings + holo boards overlay.
- **Wear:** freshest corporate skew.

### Drift Miners Collective (`faction_dmc`)

- **Miner (identity role):** Cradle + full rivet/gusset/orebox kit language; hauler uses baked `var_helios_span_dmc_orebox_v01`.
- **Patrol / escort:** production Wasp + DMC industrial kit (no baked wasp DMC yet — gap).
- **Weapons:** industrial clamp barrel variant.
- **Wear:** serviceWorn/patched heavy; ore dust baseline.

### Free Frontier (`faction_free`)

- **Militia patrol/escort:** `var_wasp_free_militia_v01` — bolt-on plates, conduit, hand rivets.
- **Hauler / courier / miner / smuggler:** kit packs (tape-and-pray, mixed plates).
- **Hub:** free habitat-pod / scrap-skirt overlay.
- **Wear:** patched-heavy even in mid-sec.

### Crimson Reach (`faction_reach`)

- **Reaver:** `var_ashline_rig_reaver_hook_v01` — grapple/crane scavenger.
- **Corsair:** `var_ashline_rig_corsair_blade_v01` — ram lip + blade plates (split from reaver).
- **Swarmer / bruiser / jackal / PD:** dart/lode donors + scrap kits; jackal/PD close hostile-map gaps.
- **Lancer sniper:** kit on Wasp until dedicated lance body exists.
- **Scrap hauler:** `var_helios_span_reach_scrap_v01`.
- **Wear:** patched-dominant; soot proud.

### The Quiet (`faction_quiet`)

- **quiet_ghost:** bonded flush kit on Wasp + `faction_quiet` profile (dim emissive, no registration).
- **Smuggler / miner:** multirole/cradle + anonymous blanking language.
- **Wear:** serviceWorn; flats wiped.

### Ascendant Choir (`faction_choir`)

- **choir_zealot:** lancet rails + ritual rivets + heat shrine kit on Wasp + `faction_choir` (brightest emissive).
- **Wear:** serviceWorn with doctrinal votive soot.

### The Vael (`faction_vael`)

- No default-route traffic/hostile ship cells in first-hour core (zone/late content).
- **Gap:** organic re-proportioned kit required before any Vael cell; rectangular kit is a defect per bible.

## Total new-asset cost

| Bucket | Tris |
|---|---:|
| Kit library (47 pieces, shared) | 20600 |
| Lane F variant overlays (tris_added) | 12092 |
| Hero wasp overlays (tris_added) | 3516 |
| Hero trade-hub overlays | 9308 |
| Scenery props (shared pool) | 15798 |
| **Sum unique candidate geometry** | **61314** |

- **Textures unique (shared):** 12 maps (1 decal atlas + 3 trim + 8 grime masks).
- **Materials unique per cell:** 0 — shared `KitMat_*` + donor materials + runtime tint.
- **Cells in matrix:** 44 (baked-variant-bearing: 23; kit-only: 21).

## Sector wear modifiers

| Band | Wear skew |
|---|---|
| High-sec | fresh ↑ / patched ↓ (renormalize) |
| Mid-sec | use cell baseline `wearTierDistribution` |
| Fringe | patched ↑ / fresh ↓ |

## TOP 5 integration actions (do NOT edit in this batch)

### 1. Faction-fork WHOLE_SHIP for traffic patrol/escort (ship_wasp)

- **File:** `src/render/partsLibrary.js`
- **Map:** `WHOLE_SHIP_FILE_BY_DEF_ID.ship_wasp + factionId OR new trafficRole patrol/escort map`
- **Candidates:** `var_wasp_scn_patrol_v01.glb`, `var_wasp_mts_escort_v01.glb`, `var_wasp_free_militia_v01.glb`
- **First-hour visibility:** Highest concurrent combat silhouette in Helios pocket
- **Tris delta:** SCN+600 / MTS+1448 / Free+1468 per instance

### 2. Faction-fork WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE.hauler

- **File:** `src/render/partsLibrary.js`
- **Map:** `WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE.hauler`
- **Candidates:** `var_helios_span_mts_sealed_v01.glb`, `var_helios_span_dmc_orebox_v01.glb`, `var_helios_span_reach_scrap_v01.glb`
- **First-hour visibility:** Dominant bulk civilian ship (weight 30)
- **Tris delta:** MTS+2028 / DMC+4560 / Reach+2296

### 3. Attach trade-hub faction overlays at station spawn

- **File:** `src/render/partsLibrary.js (+ world/station place path)`
- **Map:** `STATION_ARCHETYPE_FILES / placeFileForEntity / archetypeGlb for place_station_trade_hub`
- **Candidates:** `var_station_trade_hub_scn_overlay_v01.glb`, `var_station_trade_hub_mts_overlay_v01.glb`, `var_station_trade_hub_free_overlay_v01.glb`
- **First-hour visibility:** First dock (Helios SCN hub) + Tethys MTS + Free Reach Station
- **Tris delta:** SCN+2756 / MTS+4800 / Free+1752 overlay tris

### 4. Split reaver vs corsair ashline_rig hostile map + close three wasp gaps

- **File:** `src/render/partsLibrary.js`
- **Map:** `WHOLE_SHIP_FILE_BY_HOSTILE_ID (reaver_pirate, corsair_raider, lancer_sniper, choir_zealot, quiet_ghost)`
- **Candidates:** `var_ashline_rig_reaver_hook_v01.glb`, `var_ashline_rig_corsair_blade_v01.glb`, `kit packs for lancer/choir/quiet on wasp donor`
- **First-hour visibility:** Combat cast collapses until mid-route hostiles; gap roles currently look like patrol Wasps
- **Tris delta:** reaver+828 / corsair+1332

### 5. Faction weapon barrels + law interceptor kit on modular path

- **File:** `src/render/partsLibrary.js`
- **Map:** `weaponRecordFor default; modular compose for ship_hornet patrol_lawman`
- **Candidates:** `var_weapon_pulse_cannon_military_v01.glb`, `var_weapon_pulse_cannon_industrial_v01.glb`, `var_weapon_pulse_cannon_pirate_v01.glb`, `kit scn_law pack`
- **First-hour visibility:** Multiplies on every modular hardpoint; lawman is sole high-sec ambient enemy
- **Tris delta:** military+368 / industrial+292 / pirate+388

## Gaps (not invented as cells)

- **`var_wasp_dmc_patrol`** — Baked DMC wasp patrol body (rivet/ore-saddle grammar) _(fallback: kit pack dmc_industrial on wasp_production_v1)_
- **`var_helios_cradle_*`** — Faction cradle miner variants (DMC ore barge, Free prospector, SCN licensed, Quiet stripped, MTS sealed) _(fallback: kit packs on helios_cradle donor)_
- **`var_helios_lark_*`** — Faction courier variants on helios_lark _(fallback: kit packs on helios_lark donor)_
- **`var_helios_span_scn_sealed`** — SCN sealed corporate hauler (kit pack used now) _(fallback: kit pack scn_hauler)_
- **`var_helios_span_free_patchwork`** — Free patchwork hauler bake _(fallback: kit pack free_hauler)_
- **`var_ashline_dart_*`** — Swarm dart damage/patch dialects _(fallback: light Reach kit on ashline_dart)_
- **`var_ashline_lode_*`** — Heavy brawler armor dialects _(fallback: reach_scrap kit on ashline_lode)_
- **`var_wasp_lancer_sniper`** — Dedicated lancer silhouette (not production patrol Wasp) _(fallback: kit pack lancer_sniper on wasp_production_v1)_
- **`var_wasp_choir_zealot`** — Baked Choir zealot fighter (lancet rails + halo) _(fallback: kit pack choir_zealot)_
- **`var_wasp_quiet_ghost`** — Baked Quiet ghost low-sig fighter _(fallback: kit pack quiet_ghost)_
- **`var_station_blackmarket_*`** — Quiet/Reach/Vael blackmarket overlays (audit multi-faction station) _(fallback: none in cells (out of traffic/hostile scope); scenery wreck fragments only)_
- **`var_hull_interceptor_law`** — Baked law interceptor whole or overlay _(fallback: kit pack scn_law on hull_interceptor)_
- **`kit_organic_vael_*`** — Re-proportioned organic kit (bible: do not bolt rectangular kit onto Vael) _(fallback: no Vael ship cells — Vael only via zones/dreadnought out of first-hour core)_
- **`place_lane_beacon faction wiring`** — Runtime map from place_lane_beacon to scenery_lane_beacon_v0{1,2,3} _(fallback: not a ship cell; scenery candidates exist (tris 1048/264/392))_

## Cell index

| Faction | Role | Donor | Tris added | Integration |
|---|---|---|---:|---|
| faction_choir | choir_zealot | `wholeships/wasp_production_v1.glb` | 3998 | ADD WHOLE_SHIP_FILE_BY_HOSTILE_ID.choir_zealot → wasp+choir kit or dedicated ... |
| faction_dmc | courier | `wholeships/helios_lark.glb` | 4360 | partsLibrary.js WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE.courier + faction kit attach;... |
| faction_dmc | escort | `wholeships/wasp_production_v1.glb` | 4652 | same DMC wasp kit path + industrial weapon barrel when modular hardpoints show |
| faction_dmc | hauler | `wholeships/helios_span.glb` | 4560 | WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE.hauler faction fork → var_helios_span_dmc_ore... |
| faction_dmc | miner | `wholeships/helios_cradle.glb` | 4360 | WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE.miner + faction kit/profile; no baked cradle ... |
| faction_dmc | patrol | `wholeships/wasp_production_v1.glb` | 4360 | partsLibrary.js faction-aware ship_wasp compose: donor wasp_production_v1 + r... |
| faction_dmc | weapon_pulse_default | `weapons/weapon_pulse_cannon.glb` | 292 | partsLibrary.js weaponRecordFor default file map → faction barrel variant |
| faction_free | courier | `wholeships/helios_lark.glb` | 3504 | partsLibrary.js WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE.courier + faction kit attach;... |
| faction_free | escort | `wholeships/wasp_production_v1.glb` | 1468 | same Free militia wasp map as patrol |
| faction_free | hauler | `wholeships/helios_span.glb` | 3504 | WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE.hauler + Free kit attach OR bake var_helios_s... |
| faction_free | miner | `wholeships/helios_cradle.glb` | 3504 | WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE.miner + faction kit/profile; no baked cradle ... |
| faction_free | patrol | `wholeships/wasp_production_v1.glb` | 1468 | partsLibrary.js faction-aware ship_wasp → var_wasp_free_militia_v01.glb for f... |
| faction_free | smuggler | `hulls/hull_multirole.glb` | 3504 | modular multirole + Free kit for mid-sec smuggler traffic |
| faction_free | station_trade_hub | `places/place_station_trade_hub.glb` | 1752 | STATION_ARCHETYPE_FILES / placeFileForEntity: attach faction overlay GLB or s... |
| faction_mts | courier | `wholeships/helios_lark.glb` | 4143 | partsLibrary.js WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE.courier + faction kit attach;... |
| faction_mts | escort | `wholeships/wasp_production_v1.glb` | 1448 | same MTS wasp map as patrol; wearTier roll skews fresh for branded escorts |
| faction_mts | express | `hulls/hull_freighter.glb` | 4143 | Either map express→helios_span/variant (preferred) OR keep modular freighter ... |
| faction_mts | hauler | `wholeships/helios_span.glb` | 2028 | partsLibrary.js WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE.hauler → faction fork to var_... |
| faction_mts | miner | `wholeships/helios_cradle.glb` | 4143 | WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE.miner + faction kit/profile; no baked cradle ... |
| faction_mts | patrol | `wholeships/wasp_production_v1.glb` | 1448 | partsLibrary.js faction-aware ship_wasp whole-ship → var_wasp_mts_escort_v01.... |
| faction_mts | station_trade_hub | `places/place_station_trade_hub.glb` | 4800 | STATION_ARCHETYPE_FILES / placeFileForEntity: attach faction overlay GLB or s... |
| faction_quiet | miner | `wholeships/helios_cradle.glb` | 3272 | WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE.miner + faction kit/profile; no baked cradle ... |
| faction_quiet | quiet_ghost | `wholeships/wasp_production_v1.glb` | 3272 | ADD WHOLE_SHIP_FILE_BY_HOSTILE_ID.quiet_ghost → wasp+quiet kit or dedicated l... |
| faction_quiet | smuggler | `hulls/hull_multirole.glb` | 3272 | HULL_FILE_BY_DEF_ID.ship_drifter remains; add faction kit attach for trafficR... |
| faction_reach | bruiser_brawler | `wholeships/ashline_lode.glb` | 8512 | keep ashline_lode map; kit armor dialects; optional bake var_ashline_lode_* (... |
| faction_reach | corsair_raider | `wholeships/ashline_rig.glb` | 1720 | WHOLE_SHIP_FILE_BY_HOSTILE_ID.corsair_raider → var_ashline_rig_corsair_blade_... |
| faction_reach | hauler | `wholeships/helios_span.glb` | 2296 | WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE.hauler faction fork → var_helios_span_reach_s... |
| faction_reach | lancer_sniper | `wholeships/wasp_production_v1.glb` | 3752 | ADD WHOLE_SHIP_FILE_BY_HOSTILE_ID.lancer_sniper → dedicated lance body or was... |
| faction_reach | mine_layer_jackal | `wholeships/ashline_rig.glb` | 2408 | ADD WHOLE_SHIP_FILE_BY_HOSTILE_ID.mine_layer_jackal → ashline reaver_hook (or... |
| faction_reach | pd_screen_escort | `wholeships/ashline_lode.glb` | 8900 | ADD WHOLE_SHIP_FILE_BY_HOSTILE_ID.pd_screen_escort → ashline_lode + PD kit; c... |
| faction_reach | pirate | `hulls/hull_interceptor.glb` | 6236 | trafficRole pirate modular path: hull_interceptor + Reach kit (distinct from ... |
| faction_reach | reaver_pirate | `wholeships/ashline_rig.glb` | 828 | partsLibrary.js WHOLE_SHIP_FILE_BY_HOSTILE_ID.reaver_pirate → var_ashline_rig... |
| faction_reach | wasp_swarmer | `wholeships/ashline_dart.glb` | 1880 | keep WHOLE_SHIP_FILE_BY_HOSTILE_ID.wasp_swarmer=ashline_dart; optional swarm ... |
| faction_reach | weapon_pulse_default | `weapons/weapon_pulse_cannon.glb` | 388 | partsLibrary.js weaponRecordFor default file map → faction barrel variant |
| faction_scn | courier | `wholeships/helios_lark.glb` | 2364 | partsLibrary.js WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE.courier + faction kit attach;... |
| faction_scn | customs_cutter | `hulls/hull_interceptor.glb` | 4230 | same modular interceptor + denser sensor kit; optional hostile whole map later |
| faction_scn | escort | `wholeships/wasp_production_v1.glb` | 968 | partsLibrary.js WHOLE_SHIP_FILE_BY_DEF_ID / trafficRole escort faction fork +... |
| faction_scn | hauler | `wholeships/helios_span.glb` | 2364 | WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE.hauler + kit attach OR bake var_helios_span_s... |
| faction_scn | miner | `wholeships/helios_cradle.glb` | 2364 | WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE.miner + faction kit/profile; no baked cradle ... |
| faction_scn | patrol | `wholeships/wasp_production_v1.glb` | 600 | src/render/partsLibrary.js: introduce faction-aware whole-ship fork for traff... |
| faction_scn | patrol_lawman | `hulls/hull_interceptor.glb` | 3880 | HULL_FILE_BY_DEF_ID.ship_hornet stays; add faction/role kit attach for patrol... |
| faction_scn | rescue | `hulls/hull_multirole.glb` | 4464 | modular multirole + SCN rescue kit attach for trafficRole rescue |
| faction_scn | station_trade_hub | `places/place_station_trade_hub.glb` | 2756 | STATION_ARCHETYPE_FILES / placeFileForEntity: attach faction overlay GLB or s... |
| faction_scn | weapon_pulse_default | `weapons/weapon_pulse_cannon.glb` | 368 | partsLibrary.js weaponRecordFor default file map → faction barrel variant |

---

*Generated by `tools_g_build_matrix.py` (Lane G). No live `src/` or release maps modified.*
