# sector_sker_haven — Sker Haven

## Story band

| Field | Value |
|-------|-------|
| **Band** | S6–S7 |
| **Canon place** | Skerris Deep |
| **Gradient cite** | `docs/worldbuilding/story/SECTOR-GRADIENT.md` — S6–S7 (CINDER / SKERRIS DEEP / OUTER INDUSTRIAL) |
| **Data map** | `design/world-identity/STORY_SECTOR_MAP.md` — S6–S7 → `sector_sker_haven` |
| **Faction** | `faction_reach` — pirate haven; gate-camped |

## Mood / palette tokens

| Token | Value |
|-------|-------|
| **Palette class** | `fringe` (outer industrial; belt/fringe transition per STORY_SECTOR_MAP) |
| **MASTER_TASTE mood** | Functional wrong-lighting; graffiti with longer sentences, names, and dates |
| **UI semantic lock** | Red `#ff5c5c` (hostile/pirate), amber `#ffb35c` (bounty-board strain) |
| **World palette** | `SECTOR_PALETTE_CLASSES.fringe` — fill `0xffaa66`, rim `0xff3f2d`, fog `0x2a0d0a` |
| **Background rule** | Space luminance < 18% sRGB; uncharted frontier — no `???` on charted elements |

## Air / smell (one line)

55% spectrum at 10–11 degrees — breathable air sold in canisters alongside everything else; graffiti written for people who will come later, not people here now.

## Signature landmark

| Field | Value |
|-------|-------|
| **placement_id** | `station_sker` |
| **Name** | Sker Bazaar |
| **Position** | `{ x: -540, z: 680 }` |
| **Role** | Gate-camped pirate blackmarket — Skerris Deep haven silhouette, rep-gated approach |

## Required renderable asset roles

Not procedural-only — each ID must resolve to a manifest-valid GLB.

| placement_id | Role | `archetypeGlb` / `landmarkGlb` |
|--------------|------|--------------------------------|
| `station_sker` | Landmark station | `archetypeGlb`: `place_station_blackmarket` |
| `poi_bounty` | Bounty wreck POI | `landmarkGlb`: `place_dead_hulk` |
| `poi_stash` | Hidden stash POI | `landmarkGlb`: `place_debris_chunk` |