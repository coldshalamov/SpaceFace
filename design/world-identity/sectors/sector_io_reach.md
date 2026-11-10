# sector_io_reach — Io Reach

## Story band

| Field | Value |
|-------|-------|
| **Band** | S4–S5 |
| **Canon place** | Bourse / contested lanes |
| **Gradient cite** | `docs/worldbuilding/story/SECTOR-GRADIENT.md` — S4–S5 (HOLLOW STATION / BOURSE / CONTESTED SECTORS) |
| **Data map** | `design/world-identity/STORY_SECTOR_MAP.md` — S4–S5 → `sector_io_reach` |
| **Faction** | `faction_free` — Gate 5 jurisdiction overlap; Reach vs Concord |

## Mood / palette tokens

| Token | Value |
|-------|-------|
| **Palette class** | `fringe` |
| **MASTER_TASTE mood** | Sodium-red contested lanes; graffiti layers, jurisdiction half-measures |
| **UI semantic lock** | Cyan `#39d0ff` (info), red `#ff5c5c` (contested/hostile), amber `#ffb35c` (claim strain) |
| **World palette** | `SECTOR_PALETTE_CLASSES.fringe` — fill `0xffaa66`, rim `0xff3f2d`, fogDensity `0.00042` |
| **Background rule** | Space luminance < 18% sRGB; dual nebula/asteroid hazard read at a glance |

## Air / smell (one line)

Air within tolerance at 12–15 degrees — factions overlap at Gate 5, filing a claim requires patience the system isn't designed to reward.

## Signature landmark

| Field | Value |
|-------|-------|
| **placement_id** | `station_reach` |
| **Name** | Reach Station |
| **Position** | `{ x: -720, z: 940 }` |
| **Role** | Contested trade hub — four-gate Bourse silhouette with Reach/Concord jurisdiction tension |

## Required renderable asset roles

Not procedural-only — each ID must resolve to a manifest-valid GLB.

| placement_id | Role | `archetypeGlb` / `landmarkGlb` |
|--------------|------|--------------------------------|
| `station_reach` | Landmark station | `archetypeGlb`: `place_station_trade_hub` |
| `poi_merc` | Mercenary outpost POI | `landmarkGlb`: `place_nav_buoy` |
| `poi_cruiser` | Landmark derelict POI | `landmarkGlb`: `place_dead_hulk` |
| `poi_claim_pallas` | Claimable moon POI | `landmarkGlb`: `place_asteroid_seamed` |