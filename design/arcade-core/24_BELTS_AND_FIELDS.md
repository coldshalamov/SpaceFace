<!-- LIFETIME: DURABLE -->
# 24 — BELTS & FIELDS: the arenas

Asteroid fields are the default combat arena; their *character* is a combat variable.
`asteroidFormations.js`, `asteroidMotion.js`, `mining.js` own seams.

## Material families (look × physics × yield)

| Family | Look | Behavior | Mining yield |
|---|---|---|---|
| **Metallic** | Bright, angular, glinting | Standard | Alloys, scrap — combat-loot adjacent |
| **Carbonaceous** | Dark, soft-edged, dusty | Crumbles: impacts shed dust + gravel (debris reads) | Common ores, big volume |
| **Ice** | Pale blue, glitter fields | Chips into glitter sprays; *slick* collision proxy (low restitution variance) | Water/volatiles, fuel chain (43) |
| **Crystal** | Prismatic, internal glow | Rare; fracture minigame crits | Rare gems, tech-tree materials |
| **Volcanic** | Ember cracks, heat shimmer | Heat pocket hazard: lingering close cooks you slowly | Thermal materials, charge-crafting inputs |
| **Graveyard** | Mixed rock + wreckage fused | Salvage *and* rock in one field | Salvage commodities + lore (26) |

## Field layouts (gameplay shapes)

- **Worked field**: sparse, big rocks, miner infrastructure — easy fights, lots of anchor
  points.
- **Dense pocket**: tight cluster — chain-kill heaven, navigation risk, ambush magnet.
- **Stream**: a slow-moving river of rocks between two bodies — moving cover, slingshot
  corridor, the most "physics" arena.
- **Ring band**: planet-orbiting gravel (23) — thin, fast relative motion, beautiful.
- **The Shoal**: crystal/ice mix, drifters drifting through (19) — the pretty one.

## Rules

- Rotation matters (GDD §5 seams): every rock family rotates; mining and smashing both care.
- Rocks are honest collision at all times — including off-screen-edge rocks (no pop-in
  physics changes).
- Field layout is data per sector zone; new layouts are content, not code.

## Acceptance

- Per family × layout: one fight route showing the layout's intended tactic works (chain rate
  in dense pockets measurably higher than worked fields).
