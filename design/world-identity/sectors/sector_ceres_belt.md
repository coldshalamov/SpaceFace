# sector_ceres_belt — Ceres Belt

## Story band

| Field | Value |
|-------|-------|
| **Band** | S2–S3 |
| **Canon place** | Meridian Exchange (industrial) |
| **Gradient cite** | `docs/worldbuilding/story/SECTOR-GRADIENT.md` — S2–S3 (TYCHO RELAY / MERIDIAN EXCHANGE) |
| **Data map** | `design/world-identity/STORY_SECTOR_MAP.md` — S2–S3 → `sector_ceres_belt` |
| **Faction** | `faction_dmc` — ore refining band; "weight variance under review" |

## Mood / palette tokens

| Token | Value |
|-------|-------|
| **Palette class** | `belt` |
| **MASTER_TASTE mood** | Rust/amber belt; yellow-white fluorescents slipping toward industrial warmth |
| **UI semantic lock** | Amber `#ffb35c` (warning/strain/attention) for hazard and refinery strain cues |
| **World palette** | `SECTOR_PALETTE_CLASSES.belt` — fill `0xffb13d`, ambient `0x594a42`, fog `0x2a160c` |
| **Background rule** | Space luminance < 18% sRGB; ore-dust parallax, selective bloom on refinery stacks |

## Air / smell (one line)

Maintenance every 96 hours instead of 48; air quality adequate, temperature 18 degrees, fluorescent elements shifting yellow-white — close to full spectrum but not quite.

## Signature landmark

| Field | Value |
|-------|-------|
| **placement_id** | `station_ceres` |
| **Name** | Ceres Refinery |
| **Position** | `{ x: -1100, z: 620 }` |
| **Role** | Belt refinery stack — rust/amber silhouette marking the Meridian Exchange industrial beat |

## Required renderable asset roles

Not procedural-only — each ID must resolve to a manifest-valid GLB.

| placement_id | Role | `archetypeGlb` / `landmarkGlb` |
|--------------|------|--------------------------------|
| `station_ceres` | Landmark station | `archetypeGlb`: `place_station_refinery` |
| `station_beltout` | Secondary station | `archetypeGlb`: `place_station_mining` |
| `poi_driller` | Landmark derelict POI | `landmarkGlb`: `place_dead_hulk` |
| `poi_survey` | Survey cache POI | `landmarkGlb`: `place_debris_chunk` |