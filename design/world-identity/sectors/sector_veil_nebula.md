# sector_veil_nebula — Veil Nebula

## Story band

| Field | Value |
|-------|-------|
| **Band** | S8 |
| **Canon place** | Veil Expanse (Vael space) |
| **Gradient cite** | `docs/worldbuilding/story/SECTOR-GRADIENT.md` — S8 (VEIL EXPANSE — VAEL SPACE) |
| **Data map** | `design/world-identity/STORY_SECTOR_MAP.md` — S8 → `sector_veil_nebula` |
| **Faction** | `faction_free` / Vael — best air in outer sectors; anomaly nebula |

## Mood / palette tokens

| Token | Value |
|-------|-------|
| **Palette class** | `anomaly` |
| **MASTER_TASTE mood** | Violet/green Vael hospitality dissonance — HUD marks OUTSIDER, air is the best out here |
| **UI semantic lock** | Violet `#8d66ff` (story/anomaly), cyan `#39d0ff` (scan tech info) |
| **World palette** | `SECTOR_PALETTE_CLASSES.anomaly` — fill `0x4ddc92`, rim `0x54ffb0`, nebulaTint `0x5a1e8a` |
| **Background rule** | Space luminance < 18% sRGB; nebula shell caps at 0.12 opacity; wormhole gated by survey tech |

## Air / smell (one line)

Warm air, good lighting — Vael-built atmospheric processing the allocation queue doesn't service; food that requires context to appreciate.

## Signature landmark

| Field | Value |
|-------|-------|
| **placement_id** | `poi_anomaly` |
| **Name** | Anomaly Signal |
| **Position** | `{ x: 0, z: 0 }` |
| **Role** | Sector-center seamed asteroid — nebula heart anomaly readable from any gate approach |

## Required renderable asset roles

Not procedural-only — each ID must resolve to a manifest-valid GLB.

| placement_id | Role | `archetypeGlb` / `landmarkGlb` |
|--------------|------|--------------------------------|
| `station_veil` | Landmark station | `archetypeGlb`: `place_station_research` |
| `poi_anomaly` | Landmark POI | `landmarkGlb`: `place_asteroid_seamed` |
| `poi_wormhole` | Wormhole gate POI | `landmarkGlb`: `place_gate_jump_ring` |