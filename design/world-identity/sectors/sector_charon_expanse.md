# sector_charon_expanse — Charon Expanse

## Story band

| Field | Value |
|-------|-------|
| **Band** | S6–S7 |
| **Canon place** | Cinder |
| **Gradient cite** | `docs/worldbuilding/story/SECTOR-GRADIENT.md` — S6–S7 (CINDER / SKERRIS DEEP / OUTER INDUSTRIAL) |
| **Data map** | `design/world-identity/STORY_SECTOR_MAP.md` — S6–S7 → `sector_charon_expanse` |
| **Faction** | `faction_dmc` — Rook; bounty board; pressurized air secondary market |

## Mood / palette tokens

| Token | Value |
|-------|-------|
| **Palette class** | `belt` (outer industrial; belt/fringe transition per STORY_SECTOR_MAP) |
| **MASTER_TASTE mood** | Functional wrong-lighting at 55% spectrum; air-canister economy |
| **UI semantic lock** | Amber `#ffb35c` (recycler strain), red `#ff5c5c` (radiation hazard) |
| **World palette** | `SECTOR_PALETTE_CLASSES.belt` — fill `0xffb13d`, ambient `0x594a42`, fogDensity `0.00034` |
| **Background rule** | Space luminance < 18% sRGB; faces and wound colors read slightly wrong under belt lighting |

## Air / smell (one line)

10–11 degrees, 55% spectrum — recyclers on overextended schedules, stations supplement with pressurized canisters nobody asks the origin of.

## Signature landmark

| Field | Value |
|-------|-------|
| **placement_id** | `station_expanse` |
| **Name** | Expanse Refinery |
| **Position** | `{ x: 880, z: -640 }` |
| **Role** | Cinder industrial refinery — bounty-board economy anchor, outer-belt wrong-light silhouette |

## Required renderable asset roles

Not procedural-only — each ID must resolve to a manifest-valid GLB.

| placement_id | Role | `archetypeGlb` / `landmarkGlb` |
|--------------|------|--------------------------------|
| `station_expanse` | Landmark station | `archetypeGlb`: `place_station_refinery` |
| `poi_colony` | Landmark colony POI | `landmarkGlb`: `place_conveyor_barge` |