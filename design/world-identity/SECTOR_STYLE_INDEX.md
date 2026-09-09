# Sector Style Index

Per-sector style specs live in `design/world-identity/sectors/<sector_id>.md`.
Story bands cite `docs/worldbuilding/story/SECTOR-GRADIENT.md`; data IDs cite `design/world-identity/STORY_SECTOR_MAP.md`.
Palette classes and mood tokens inherit `design/spec2/00_MASTER_TASTE.md` §3.
Landmark `placement_id` values come from `src/data/sectorAnchors.js` (read-only reference).

| `sector_id` | Story band | Story place (canon) | Palette class | Signature landmark (`placement_id`) | Landmark GLB | Primary station archetype |
|-------------|------------|---------------------|---------------|-------------------------------------|--------------|---------------------------|
| `sector_helios_prime` | S1 | Helios Prime (clean core) | `core` | `station_helios` | `place_station_trade_hub` | `place_station_trade_hub` |
| `sector_ceres_belt` | S2–S3 | Meridian Exchange (industrial) | `belt` | `station_ceres` | `place_station_refinery` | `place_station_refinery` |
| `sector_tethys_junction` | S2–S3 | Tycho Relay | `core` | `station_tethys` | `place_station_trade_hub` | `place_station_trade_hub` |
| `sector_vesta_forge` | S2–S3 | Forge industrial ring | `belt` | `station_forge` | `place_station_fab` | `place_station_fab` |
| `sector_pallas_drift` | S4–S5 | Hollow Station | `fringe` | `station_smuggler` | `place_station_blackmarket` | `place_station_trade_hub` |
| `sector_io_reach` | S4–S5 | Bourse / contested lanes | `fringe` | `station_reach` | `place_station_trade_hub` | `place_station_trade_hub` |
| `sector_charon_expanse` | S6–S7 | Cinder | `belt` | `station_expanse` | `place_station_refinery` | `place_station_refinery` |
| `sector_sker_haven` | S6–S7 | Skerris Deep | `fringe` | `station_sker` | `place_station_blackmarket` | `place_station_blackmarket` |
| `sector_veil_nebula` | S8 | Veil Expanse (Vael space) | `anomaly` | `poi_anomaly` | `place_asteroid_seamed` | `place_station_research` |
| `sector_ashfall_reach` | S9 | Ashfall Reach (endgame) | `anomaly` | `station_ashcache` | `place_station_blackmarket` | `place_station_blackmarket` |

## Palette class quick reference (MASTER_TASTE §3)

| Class | World hues | Mood |
|-------|------------|------|
| `core` | Cyan `#39d0ff` / steel | Maintained surfaces, licensed signage, full-spectrum lighting |
| `belt` | Rust / amber `#ffb35c` | Industrial warmth, yellow-white fluorescents slipping, ore/refinery grit |
| `fringe` | Sodium-red | Contested jurisdiction, graffiti layers, functional wrong-lighting |
| `anomaly` | Violet `#8d66ff` / green | Story/anomaly dissonance — Vael hospitality or Pit-temperature thin air |