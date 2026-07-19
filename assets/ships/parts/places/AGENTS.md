# assets/ships/parts/places/ — place art and map proxies

Place GLBs: the physical objects a player flies up to. Stations, gates, buoys, hulks, rocks.

**Authority.** `assets/ships/AGENTS.md` owns the promotion contract, export rules and evidence
requirements for everything in this tree — read it first, it is not restated here. This file covers
only what is specific to *places*: how a place's art relates to its **map proxy**, and when bespoke
Blender work is actually justified.

For registering the place itself (the data half), see **`src/data/PLACE_REGISTRATION.md`**.

---

## A map proxy is not the place's art

These are two different objects with budgets three orders of magnitude apart:

| | Gameplay asset (here) | Map proxy (`src/core/atlasProxy.js`) |
|---|---|---|
| Seen at | 200 WU, filling the screen | chart range — a mark among dozens |
| Job | read as architecture | read as *a place of this kind, there* |
| Budget | up to 65 MB / 1.1 M tris for a hero landmark | **512 triangles**, often zero |
| Count on screen | 1–2 | 50+ |

**Never load a gameplay GLB to draw a distant map marker.** `place_station_refinery.glb` is 23.4 MB;
at chart range it is a dot. The proxy layer exists so that never happens by accident.

## The tiers, cheapest first

1. **`glb-derived`** — the place already ships art here, so the pipeline decimates it (⅛ of source,
   capped at 512 tris). Costs no new asset.
2. **`procedural`** — parametric geometry from authored numbers (a zone radius, a gate ring, a
   corridor chord). Generated at runtime. Free.
3. **`glyph`** — a standardized glyph plus accessible text. **Cannot fail.**

Tier 3 is why **a new place never needs art to ship**. It charts, labels, describes itself to a
screen reader and inspects with nothing in this directory at all. `check:atlas-integrity` asserts
this directly (`noPlaceRequiresBespokeArt`) — if it ever fails, ordinary content has silently become
"commission a hologram first", which is the thing the tiers exist to prevent.

Bespoke work is an **earned upgrade**, never an entry requirement.

---

## Which places actually justify bespoke Blender work

The honest argument for a hero asset is **silhouette collision**, not importance in the abstract.
Measured reuse across authored places today:

| Archetype | Places sharing it |
|---|---|
| `place_debris_chunk` | 18 |
| `place_dead_hulk` | 15 |
| `place_station_blackmarket` | 8 |
| `place_station_trade_hub` | 6 |
| `place_station_research` | 6 |

Reuse is correct and should stay for ordinary content — a generic hulk is *supposed* to read as
"a hulk". Hero work is justified only where a place must **not** read as a repeat.

### Recommended hero list

Ordered by argument strength. Each names the specific collision it resolves.

| # | Place | Why it justifies bespoke work |
|---|---|---|
| 1 | **`station_helios`** — Helios Station | The most-looked-at object in the game: starting station, every early dock, the tutorial's anchor. Currently one of six `place_station_trade_hub` instances. |
| 2 | **`station_tethys`** — Tethys Trade Hub | The destination of the canonical route and the program's finish line (D11). **It currently shares its exact silhouette with Helios** — so the two endpoints of the journey the whole program is built around are visually identical. This is the single worst collision in the set. |
| 3 | **`poi_wormhole`** / Veil → Ashfall | The only one-way link in the entire atlas (`check:atlas-integrity` reports it as the sole non-reciprocal gate). Unique traversal rules deserve unique art; it currently reads as ordinary furniture. |
| 4 | **`poi_memorial`** — Memorial Array | Narrative anchor in the starting sector, carrying the Pit convoy backstory. Renders as `place_station_billboard` — an advertising hoarding standing in for a war memorial. |
| 5 | **`station_sker`** — Sker Bazaar | Reputation-gated faction hub and a major story location, currently one of eight `place_station_blackmarket` instances. |
| 6 | **`poi_boss`** — Boss Arena Signal | The story climax renders as `place_nav_buoy`, an object the player has passed a hundred times. |
| 7 | **`station_veil`** — Research Station Veil | Gates the tech-locked wormhole; one of six identical research stations at the point the story asks the player to care about it. |
| 8 | **`station_ashcache`** — Ruined Cache Station | Endgame sector's anchor, currently a blackmarket repeat. |

**Not on this list, deliberately:** the 18 debris chunks, the 15 hulks, the claim rocks, the lane
beacons, and every ordinary zone. These *should* share silhouettes — that reuse is what makes the
world cheap to extend, and a bespoke variant of each would buy nothing a player would notice.

**Also not on this list:** anything whose problem is a map proxy. If a place reads poorly on the
chart, that is a glyph or tier question in `src/core/atlasProxy.js`, and modelling a hero asset will
not fix it.

---

## Authoring one

```
node scripts/author-place-archetype.mjs <place_id> [--blender=path/to/blender.exe]
node scripts/promote-place-archetype.mjs <place_id>
```

The builder is `tools/art/blender/author_place_archetype.py`; finalization runs through
`tools/art/finalize_part.mjs` and records provenance in
`assets/ships/parts/blender/authoring.json`. Register the result in `parts_manifest.json` and
reference it from the authored anchor as `archetypeGlb` (stations, gates) or `landmarkGlb` (POIs).

A hero asset that exceeds the ordinary part profile must declare `budgetClass: "landmark"` in the
manifest — that field, not a triangle heuristic, is what
`scripts/check-parts-manifest.mjs` classifies on.

## Validating

```
npm run check:atlas-integrity     # the place charts, resolves art, and has an accessible label
npm run check:atlas-place-path    # a player can see, select, route to and save it
npm run check:parts-manifest      # the asset itself is well-formed and within its budget class
npm run check:asset-reachability  # it will actually ship in the bundle
```

`check:atlas-integrity` reports overweight proxy *sources* (seven today) as findings rather than
failures — asset weight is `check:parts-manifest`'s ruling to make, not the atlas gate's.
