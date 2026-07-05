# Curated Space-Game Features — Asset & Data Wiring

Extends `WORLD_NAVIGATION_SPEC.md` with Eve Online, Elite Dangerous, and Star Citizen patterns
mapped to **concrete assets, data fields, and follow-up systems**. Runtime UI is out of scope here;
this spec defines what must exist for features to land without procedural sameness.

## Feature index

| ID | Source inspiration | Player read | Required assets | Data fields | Validator |
|----|-------------------|-------------|-----------------|-------------|-----------|
| F01 | Eve fixed celestials | "That station is always there" | `place_station_*`, `place_gate_jump_ring` | `sectorAnchors.*.pos`, `entity.data.archetypeGlb` | `check:sector-geography`, `check:station-archetype-wiring` |
| F02 | Eve station silhouettes | "Amarr vs Minmatar at a glance" | 8 distinct `place_*` GLBs | `station.archetypeGlb`, `STATION_TYPES` map | `check:station-archetype-glb-load` |
| F03 | Eve system map | Named dots that don't shuffle | Universe map concept + sector graph | `sector.position`, `gates[].to`, `charted` | `check:concept-index` |
| F04 | Eve security/status | Green/amber/red trust | Palette classes per sector | `security`, `SECTOR_PALETTE_CLASSES` | sector style specs |
| F05 | Eve overview panel | Sortable contact list | Station/gate/POI entity names | `entity.data.name`, `stationTypeId` | follow-up HUD `sf-overview` |
| F06 | Eve economic hubs | Jita = trade, Rens = black market | Per-sector archetype + services | `station.services[]`, style spec | `place-identity-index.json` |
| F07 | Elite body scale | Planet as backdrop anchor | Planet concept per core sector | `sector.planet` (future), `planetFactory` | concept `map/planets/` |
| F08 | Elite signal sources | POI ping on scan | Landmark GLBs | `poi.landmarkGlb`, `poi.scanRange` | `world.js` POI spawn |
| F09 | Star Citizen landing zones | Dock spar readability | `SOCKET_Structure_Core` on stations | `station.dockRadius`, `archetypeGlb` | manifest hooks |
| F10 | Star Citizen repair/refuel lanes | Service identity per place | Archetype + service rail UI | `station.services`, `STATION_TYPES` | `check:station-service-rail` |

## Per-feature acceptance (starter band)

### F02 — Distinct silhouettes (shipped vertical slice)

- ≥5 distinct bounding boxes across release GLBs (`check:station-archetype-glb-load`)
- `place_station_trade_hub` authored via Blender MCP with concept JPG reference (`assets/ships/parts/blender/place_station_trade_hub.blend`)
- Runtime upgrade from fallback boundary to authored GLB (`probe-station-archetypes-live.mjs`)

### F07 — Planets (concept phase)

- `concept_planet_helios.jpg` — core-sector gas giant backdrop reference
- Follow-up: wire `createPlanetFactory` to sector `paletteClass` tokens

### F08 — Landmark POIs (shipped data)

- `landmarkGlb` on POIs forwarded to `entity.data.placeId` at spawn
- Concept refs: `concept_landmark_memorial.jpg`, `concept_landmark_driller.jpg`

## Anti-patterns (MASTER_TASTE §6)

- Procedural-only stations with no `archetypeGlb` in charted space
- RNG repositioning of gates/stations between visits
- Contact-sheet caption text baked into runtime concept JPGs
- Visor/cockpit framing for place readability