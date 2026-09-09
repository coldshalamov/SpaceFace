# sector_pallas_drift — Pallas Drift

## Story band

| Field | Value |
|-------|-------|
| **Band** | S4–S5 |
| **Canon place** | Hollow Station |
| **Gradient cite** | `docs/worldbuilding/story/SECTOR-GRADIENT.md` — S4–S5 (HOLLOW STATION / BOURSE / CONTESTED SECTORS) |
| **Data map** | `design/world-identity/STORY_SECTOR_MAP.md` — S4–S5 → `sector_pallas_drift` |
| **Faction** | `faction_mts` — Voss territory; layered graffiti; Smuggler Den |

## Mood / palette tokens

| Token | Value |
|-------|-------|
| **Palette class** | `fringe` |
| **MASTER_TASTE mood** | Sodium-red contested; graffiti layers, 70% spectrum, half-measures that hold |
| **UI semantic lock** | Amber `#ffb35c` (strain), red `#ff5c5c` (hostile overlap) |
| **World palette** | `SECTOR_PALETTE_CLASSES.fringe` — fill `0xffaa66`, rim `0xff3f2d`, fog `0x2a0d0a` |
| **Background rule** | Space luminance < 18% sRGB; nebula tint at 40% intensity, layered wall-text dressing |

## Air / smell (one line)

12–15 degrees, 70% spectrum — air within tolerance, pre-packaged commissary food, graffiti layers accumulating with Pit-origin names on the oldest lines.

## Signature landmark

| Field | Value |
|-------|-------|
| **placement_id** | `station_smuggler` |
| **Name** | Smuggler Den |
| **Position** | `{ x: -1080, z: 540 }` |
| **Role** | Hollowed-out blackmarket station — Quiet-route silhouette, Voss territory marker |

## Required renderable asset roles

Not procedural-only — each ID must resolve to a manifest-valid GLB.

| placement_id | Role | `archetypeGlb` / `landmarkGlb` |
|--------------|------|--------------------------------|
| `station_smuggler` | Landmark station | `archetypeGlb`: `place_station_blackmarket` |
| `station_drift` | Secondary station | `archetypeGlb`: `place_station_trade_hub` |
| `poi_pwreck` | Pirate wreck POI | `landmarkGlb`: `place_dead_hulk` |
| `poi_hcache` | Hidden cache POI | `landmarkGlb`: `place_debris_chunk` |