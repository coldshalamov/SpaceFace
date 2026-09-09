# assets/ships/parts/places/ — place art and map proxies

Place GLBs: the physical objects a player flies up to. Stations, gates, buoys, hulks, rocks.

**Authority.** `assets/ships/AGENTS.md` owns promotion, export, and evidence for this tree — read it
first. This file covers only what is specific to *places*: gameplay art vs **map proxy**, and when
bespoke Blender work is justified. Data registration: **`src/data/PLACE_REGISTRATION.md`**. Hero
candidates: [`HERO_PLACES.md`](./HERO_PLACES.md).

## A map proxy is not the place's art

These are two objects with budgets three orders of magnitude apart:

| | Gameplay asset (here) | Map proxy (`src/core/atlasProxy.js`) |
|---|---|---|
| Seen at | 200 WU, filling the screen | chart range — a mark among dozens |
| Job | read as architecture | read as *a place of this kind, there* |
| Budget | up to 65 MB / 1.1 M tris for a hero landmark | **512 triangles**, often zero |
| Count on screen | 1–2 | 50+ |

**Never load a gameplay GLB to draw a distant map marker.** The proxy layer exists so that never
happens by accident.

## The tiers, cheapest first

1. **`glb-derived`** — decimate existing place art (⅛ of source, capped at 512 tris).
2. **`procedural`** — parametric geometry from authored numbers. Free at runtime.
3. **`glyph`** — standardized glyph plus accessible text. **Cannot fail.**

Tier 3 is why **a new place never needs art to ship**. `check:atlas-integrity` asserts
`noPlaceRequiresBespokeArt`. Bespoke work is an **earned upgrade** for silhouette collision, not an
entry requirement. Ordinary hulks, debris, and beacons *should* share silhouettes. Chart problems
are glyph/proxy work in `src/core/atlasProxy.js`, not a new hero GLB.

## Authoring

```
node scripts/author-place-archetype.mjs <place_id> [--blender=path/to/blender.exe]
node scripts/promote-place-archetype.mjs <place_id>
```

Builder: `tools/art/blender/author_place_archetype.py`. Finalize through
`tools/art/finalize_part.mjs`. Register in `parts_manifest.json` as `archetypeGlb` or `landmarkGlb`.
A hero that exceeds the ordinary part profile must declare `budgetClass: "landmark"`.

## Validating

`npm run check:atlas-integrity`, `check:atlas-place-path`, `check:parts-manifest`,
`check:asset-reachability`. Overweight proxy *sources* are findings for `check:parts-manifest`, not
atlas-gate failures.
