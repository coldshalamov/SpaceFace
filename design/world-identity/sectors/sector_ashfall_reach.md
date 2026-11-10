# sector_ashfall_reach — Ashfall Reach

## Story band

| Field | Value |
|-------|-------|
| **Band** | S9 |
| **Canon place** | Ashfall Reach (endgame) |
| **Gradient cite** | `docs/worldbuilding/story/SECTOR-GRADIENT.md` — S9 (ASHFALL REACH) |
| **Data map** | `design/world-identity/STORY_SECTOR_MAP.md` — S9 → `sector_ashfall_reach` |
| **Faction** | `faction_vael` — Pit-smell air; Kurtz ledger; boss arena |

## Mood / palette tokens

| Token | Value |
|-------|-------|
| **Palette class** | `anomaly` |
| **MASTER_TASTE mood** | Pit-temperature thin air; sparse old survey graffiti; violet/green anomaly endgame |
| **UI semantic lock** | Violet `#8d66ff` (story/anomaly), red `#ff5c5c` (boss arena danger) |
| **World palette** | `SECTOR_PALETTE_CLASSES.anomaly` — fill `0x4ddc92`, fog `0x160d2c`, fogDensity `0.00036` |
| **Background rule** | Space luminance < 18% sRGB; moving radiation hazard; wormhole entry from Veil gated |

## Air / smell (one line)

Reserve atmosphere only — cold, thin air that smells like hydraulic fluid over something organic the undersized scrubbers can't clear; the lower decks of the Pit.

## Signature landmark

| Field | Value |
|-------|-------|
| **placement_id** | `station_ashcache` |
| **Name** | Ruined Cache Station |
| **Position** | `{ x: -820, z: 480 }` |
| **Role** | Kurtz figure's sealed-tank station — Pit-recognition silhouette at the river's end |

## Required renderable asset roles

Not procedural-only — each ID must resolve to a manifest-valid GLB.

| placement_id | Role | `archetypeGlb` / `landmarkGlb` |
|--------------|------|--------------------------------|
| `station_ashcache` | Landmark station | `archetypeGlb`: `place_station_blackmarket` |
| `poi_boss` | Landmark boss arena POI | `landmarkGlb`: `place_nav_buoy` |
| `poi_vault` | Hidden vault POI | `landmarkGlb`: `place_debris_chunk` |