# sector_helios_prime — Helios Prime

## Story band

| Field | Value |
|-------|-------|
| **Band** | S1 |
| **Canon place** | Helios Prime (clean core) |
| **Gradient cite** | `docs/worldbuilding/story/SECTOR-GRADIENT.md` — S1 (HELIOS PRIME) |
| **Data map** | `design/world-identity/STORY_SECTOR_MAP.md` — S1 → `sector_helios_prime` |
| **Faction** | `faction_scn` — Vale / Logistics Oversight offices |

## Mood / palette tokens

| Token | Value |
|-------|-------|
| **Palette class** | `core` |
| **MASTER_TASTE mood** | Cyan/steel, maintained surfaces, licensed signage only |
| **UI semantic lock** | Cyan `#39d0ff` (interactive/friendly/info), white `#d7e6ff` (primary text) |
| **World palette** | `SECTOR_PALETTE_CLASSES.core` — fill `0x39d0ff`, ambient `0x42506f`, fog `0x0a1430` |
| **Background rule** | Space luminance < 18% sRGB; emissives carry the night (windows, beacons) |

## Air / smell (one line)

Full spectrum, 22 degrees — food that tastes like food; recyclers serviced on schedule because the people who fund them live here and breathe the air.

## Signature landmark

| Field | Value |
|-------|-------|
| **placement_id** | `poi_memorial` |
| **Name** | The Candle Fleet (depth program C3) |
| **Position** | `{ x: 1680, z: -820 }` |
| **Role** | Twenty-four candles around a deliberately dark twenty-fifth plinth — the tutorial sector's quiet landmark. Landmarked per PQ-153.02 (fielded 2026-09-25 still review) |
| **Stand-in** | `place_memorial_array` until depth H1c authors the candle-grid asset |

## Required renderable asset roles

Not procedural-only — each ID must resolve to a manifest-valid GLB.

| placement_id | Role | `archetypeGlb` / `landmarkGlb` |
|--------------|------|--------------------------------|
| `station_helios` | Landmark station | `archetypeGlb`: `place_station_trade_hub` |
| `station_coalition` | Secondary station | `archetypeGlb`: `place_station_military` |
| `poi_tutorial` | Tutorial beacon POI | `landmarkGlb`: `place_lane_beacon` |
| `poi_memorial` | Hero landmark POI | `landmarkGlb`: `place_memorial_array` (stand-in; H1c owns the bespoke candle fleet) |