# sector_vesta_forge — Vesta Forge

## Story band

| Field | Value |
|-------|-------|
| **Band** | S2–S3 |
| **Canon place** | Forge industrial ring |
| **Gradient cite** | `docs/worldbuilding/story/SECTOR-GRADIENT.md` — S2–S3 (TYCHO RELAY / MERIDIAN EXCHANGE) |
| **Data map** | `design/world-identity/STORY_SECTOR_MAP.md` — S2–S3 → `sector_vesta_forge` |
| **Faction** | `faction_dmc` — module craft, slag radiation hazard |

## Mood / palette tokens

| Token | Value |
|-------|-------|
| **Palette class** | `belt` |
| **MASTER_TASTE mood** | Rust/amber industrial ring; ore-dust and refinery-stack emissives |
| **UI semantic lock** | Amber `#ffb35c` (radiation strain), red `#ff5c5c` (hazard zones) |
| **World palette** | `SECTOR_PALETTE_CLASSES.belt` — fill `0xffb13d`, nebulaTint `0x8a4a1e`, fog `0x2a160c` |
| **Background rule** | Space luminance < 18% sRGB; foundry glow selective, never global bloom > 0.9 |

## Air / smell (one line)

Industrial band air — adequate tolerance, yellow-white lighting, contracts and weight-variance paperwork accumulating while the forge runs hot.

## Signature landmark

| Field | Value |
|-------|-------|
| **placement_id** | `station_forge` |
| **Name** | Forge Foundry |
| **Position** | `{ x: -480, z: 720 }` |
| **Role** | Fab-ring foundry — module-craft silhouette with slag-radiation hazard read at distance |

## Required renderable asset roles

Not procedural-only — each ID must resolve to a manifest-valid GLB.

| placement_id | Role | `archetypeGlb` / `landmarkGlb` |
|--------------|------|--------------------------------|
| `station_forge` | Landmark station | `archetypeGlb`: `place_station_fab` |
| `station_depot3` | Secondary station | `archetypeGlb`: `place_station_mining` |
| `poi_freighter` | Landmark derelict POI | `landmarkGlb`: `place_dead_hulk` |