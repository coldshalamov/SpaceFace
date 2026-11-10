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
| **placement_id** | `poi_sker_throne` |
| **Name** | The Skerris Throne (depth program C13d) |
| **Position** | `{ x: 300, z: -550 }` — on the charted Pallas gate → Sker Bazaar chord, threading the gap between the sector's two dense-asteroid pockets |
| **Role** | A fortress welded from captured hulls, every plate a raid trophy with a story on scan; flown past on final approach to the Bazaar. Landmarked per PQ-153.02 (fielded 2026-09-25 still review) |
| **Stand-in** | `place_dead_hulk` — the honest silhouette for welded hulls until depth H1h pass 1 authors the bespoke fortress |

## Required renderable asset roles

Not procedural-only — each ID must resolve to a manifest-valid GLB.

| placement_id | Role | `archetypeGlb` / `landmarkGlb` |
|--------------|------|--------------------------------|
| `station_sker` | Landmark station | `archetypeGlb`: `place_station_blackmarket` |
| `poi_sker_throne` | Hero landmark POI | `landmarkGlb`: `place_dead_hulk` (stand-in; H1h pass 1 owns the bespoke fortress) |
| `poi_bounty` | Bounty wreck POI | `landmarkGlb`: `place_dead_hulk` |
| `poi_stash` | Hidden stash POI | `landmarkGlb`: `place_debris_chunk` |