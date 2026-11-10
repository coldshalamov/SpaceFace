# World Navigation Spec — Eve-Inspired Place Readability

Curated features from Eve Online (and similar MMO space games) mapped to **concrete assets and data
fields** in SpaceFace. Runtime UI implementation is follow-up work (SPEC2/04, SPEC2/06); this spec
defines what assets/data must exist for those features to land.

## Feature map

### 1. Fixed named landmarks (Eve: celestials at fixed system positions)

| Requirement | Asset / data | Field |
|-------------|--------------|-------|
| Stations never shuffle | Archetype GLB per `type` | `station.archetypeGlb` in `sectorAnchors.js` |
| Station position stable | Authored anchor | `station.pos.{x,z}` |
| POI landmarks visible | Place GLB | `poi.landmarkGlb`, `poi.landmark: true` |
| Gate readable silhouette | Jump ring GLB | `place_gate_jump_ring`, `gate.archetypeGlb` |
| Gate position stable | Authored anchor | `gates[].pos` |

**Validator:** `npm run check:sector-geography`

### 2. Distinct station silhouettes (Eve: Amarr cathedral vs Minmatar scrapyard)

| Archetype ID | GLB | Used for `STATION_TYPES` |
|--------------|-----|--------------------------|
| `place_station_trade_hub` | Ring + tower | `trade_hub` |
| `place_station_refinery` | Stacks + slag base | `refinery` |
| `place_station_military` | Bastion + dish | `military`, customs |
| `place_station_blackmarket` | Asymmetric scrap | `blackmarket` |
| `place_station_fab` | Foundry block | `fab` |
| `place_station_mining` | Small rig | `mining` |
| `place_station_research` | Glass dome | `research` |
| `place_gate_jump_ring` | Torus gate | all jump gates |

**Validator:** `npm run check:art` (manifest + release GLBs)

### 3. Local / system map labeling (Eve: solar system map with names)

| UI surface | Data source | Labels required |
|------------|-------------|-----------------|
| Local map (N) | `SECTORS` + `sectorAnchors` | Station name, gate destination, POI name |
| HUD waypoint arrow | `state.nav.waypoint` | Target station/POI name |
| Radar (compact) | Entity `data.name` | Station/gate type icon + name on expand |

**Follow-up:** `src/ui/screens/localmap.js` — render `archetypeGlb` icon key in legend;
`src/ui/radar.js` — label mode on tactical expand.

### 4. Charted vs frontier fog policy (Eve: security color + known space)

| Zone | Star map (M) | Rule (MASTER_TASTE §6) |
|------|--------------|------------------------|
| `charted: true` | Show sector name + faction color | No `???` on charted nodes |
| Adjacent to charted | Show name + "uncharted interior" subtitle | One-hop preview |
| Tier ≥3 uncharted | `???` until `discovery.discovered` | Frontier fog OK |
| Security gradient | Bar color from `security` | Green >0.6, amber 0.3–0.6, red <0.3 |

**Data:** `sector.charted`, `world.discovery[sectorId].discovered`

### 5. Overview-style contact list (Eve: Overview panel)

| Column | Source |
|--------|--------|
| Name | `entity.data.name` or station catalog |
| Type | station / gate / poi / hostile |
| Distance | `dist(player, entity)` |
| Action | DOCK / JUMP / TRACK |

**Follow-up:** HUD strip `sf-overview` — reads same entity list as radar, sorted by distance.

### 6. Economic identity per place (Eve: Jita = trade, Rens = pirate market)

| Sector | Story role | Signature service | Landmark |
|--------|-----------|-------------------|----------|
| Helios Prime | Clean core | missions + shipyard | Memorial Array |
| Ceres Belt | Ore/refine | `ore_buy`, `refine` | Abandoned Driller |
| Tethys Junction | Contracts hub | missions + customs toll | Black Market Contact |
| Pallas Drift | Hollow / smuggle | `black_market` | Smuggler Den |
| Veil Nebula | Vael research | `scan_tech` | Anomaly Signal |

**Data:** `station.services[]`, `design/world-identity/sectors/*.md`

## Index linkage

All features trace through `design/world-identity/place-identity-index.json`:

`story_citation → concept_id → blender_part_id → sector_placement_id`