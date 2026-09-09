# sector_tethys_junction — Tethys Junction

## Story band

| Field | Value |
|-------|-------|
| **Band** | S2–S3 |
| **Canon place** | Tycho Relay |
| **Gradient cite** | `docs/worldbuilding/story/SECTOR-GRADIENT.md` — S2–S3 (TYCHO RELAY / MERIDIAN EXCHANGE) |
| **Data map** | `design/world-identity/STORY_SECTOR_MAP.md` — S2–S3 → `sector_tethys_junction` |
| **Faction** | `faction_mts` — contracts board, Kessler/Drift jobs, MTS vs Concord visible |

## Mood / palette tokens

| Token | Value |
|-------|-------|
| **Palette class** | `core` (relay band; core/belt transition per STORY_SECTOR_MAP) |
| **MASTER_TASTE mood** | Yellow-white fluorescents slipping; factions visible and competing |
| **UI semantic lock** | Cyan `#39d0ff` (info), amber `#ffb35c` (contracts strain / "under review") |
| **World palette** | `SECTOR_PALETTE_CLASSES.core` — fill `0x39d0ff`, ambient `0x42506f`, fog `0x0a1430` |
| **Background rule** | Space luminance < 18% sRGB; lane traffic emissives between four gate bearings |

## Air / smell (one line)

Adequate air quality at 18 degrees; graffiti survives a full maintenance cycle before cover — factions compete openly and "under review" stops meaning anything here.

## Signature landmark

| Field | Value |
|-------|-------|
| **placement_id** | `station_tethys` |
| **Name** | Tethys Trade Hub |
| **Position** | `{ x: 1050, z: 380 }` |
| **Role** | Four-gate junction hub; contracts-board silhouette at the relay crossroads |

## Required renderable asset roles

Not procedural-only — each ID must resolve to a manifest-valid GLB.

| placement_id | Role | `archetypeGlb` / `landmarkGlb` |
|--------------|------|--------------------------------|
| `station_tethys` | Landmark station | `archetypeGlb`: `place_station_trade_hub` |
| `station_customs` | Secondary station | `archetypeGlb`: `place_station_military` |
| `poi_blackmkt` | Hidden contact POI | `landmarkGlb`: `place_nav_buoy` |