# Place-Identity Pipeline — Story → Concept Art → Blender → Release → Fixed Geography

End-to-end workflow for making SpaceFace sectors feel like **named places** (Eve-style readability)
rather than procedural void with dots.

## ID conventions (stable across the chain)

| Layer | Prefix / pattern | Example |
|-------|------------------|---------|
| Story band | `S0`–`S9` in `SECTOR-GRADIENT.md` | S1 = Helios Prime |
| Sector data | `sector_*` in `src/data/sectors.js` | `sector_helios_prime` |
| Station | `station_*` | `station_helios` |
| Gate edge | `gate_*` or `gates[].to` | `gate_ceres_belt` |
| Field | `f_*` | `f_helios_starter` |
| POI | `poi_*` | `poi_memorial` |
| Concept art | `concept_*` in `assets/concept/index.json` | `concept_helios_station` |
| Blender part | `place_*` or `world_*` in `parts_manifest.json` | `place_station_trade_hub` |
| Faction | `faction_*` in `src/data/factions.js` | `faction_scn` |

Machine-readable index: `design/world-identity/place-identity-index.json`

## Pipeline stages

### 1. Story intake (read-only canon)

- **Sources:** `docs/worldbuilding/story/SECTOR-GRADIENT.md`, `docs/worldbuilding/vibe/*`,
  `docs/worldbuilding/orgs/factions-CANONICAL.md`, chapter docs.
- **Output:** story↔data mapping (`STORY_SECTOR_MAP.md`) — never overwrite canon prose.
- **Rule:** story names (Tycho Relay, Hollow Station) map to `sector_*` IDs via explicit table.

### 2. Per-area style spec

- **Location:** `design/world-identity/sectors/<sector_id>.md` + `SECTOR_STYLE_INDEX.md`
- **Each spec lists:**
  - Story band + citations
  - Mood tokens aligned to `design/spec2/00_MASTER_TASTE.md` §3 (palette class, UI hues)
  - Signature landmark (≥1 unmissable authored anchor)
  - Required renderable asset roles (station archetype GLB, gate, dressing props)
  - Procedural vs fixed spawn policy

### 3. Concept art (image gen → tweak → file)

- **Location:** `assets/concept/` organized by `sectors/`, `factions/`, `archetypes/`, `map/`
- **Index:** `assets/concept/index.json` maps `concept_id → target_asset_role → story_citation`
- **Rules:**
  - Clean single-subject reference sheets — **no baked caption/contact-sheet text** (runtime-safe)
  - 16:9 or 1:1 per subject; filename = concept_id
  - Heavy reference chaining within a sector band for visual consistency
  - Use `assets/bible/B-001.jpg` + sector palette tokens as style anchors

### 4. Blender authoring (longform lane)

- **Bootstrap:** `npm run author:place-archetype -- <part_id>` → Blender build → `finalize_part.mjs` → `authoring.json` **`bootstrap_pending`**
- **Promotion:** `npm run promote:place-archetype -- <part_id>` (or `--all`) → silhouette IoU gate → **`blender_mcp`** + `iteration_ledger.json`
- **Tool:** Blender MCP per `design/spec2/AGENT_PROMPTS.md` §10 — load concept JPG as `REF_<part_id>` in Blender
- **Builder script:** `tools/art/blender/author_place_archetype.py` — concept-referenced templates (bevel/torus silhouettes);
  human/MCP sculpt pass iterates until the mesh reads like the concept (not auto-sculpted from pixels)
- **Resemblance gate:** `npm run check:place-concept-resemblance` — 96×96 concept↔GLB silhouette IoU (min 0.12)
- **Provenance:** `authoring.json` records `bootstrap_pending` | `blender_mcp` | `procedural_fallback` per archetype
- **Source saves:** `assets/ships/parts/blender/<part_id>.blend`
- **Export path:** `assets/ships/parts/places/<part_id>.glb` → `node tools/art/finalize_part.mjs <glb> <part_id> --method=blender_mcp`
- **Contract:** `assets/ships/parts/parts_manifest.json` (+X forward, +Y up, metre units,
  `Material_Hull|Accent|Glass|Mechanical`, 500–8000 tris, ≤3.5 MB)
- **Vertical slice shipped (5 promoted `blender_mcp` + IoU ledger):**
  - `place_station_trade_hub` — IoU 0.61
  - `place_station_refinery` — IoU 0.74
  - `place_station_military` — IoU 0.39
  - `place_station_blackmarket` — IoU 0.47
  - `place_gate_jump_ring` — IoU 0.27
- **CI/dev fallback:** `procedural_fallback` in `authoring.json` for fab, mining, research until promoted
- **Validators:** `check:place-concept-resemblance`, `check:station-archetype-glb-load` (provenance + geometry), `probe-station-archetypes-live.mjs` (runtime + method)

### 5. Release build

```bash
node scripts/build-world-station-archetypes.mjs   # if source GLBs changed
npm run build:sg04:release-assets
npm run check:art
```

Never hand-edit `assets/ships/release/` — build pipeline owns release outputs.

### 6. Fixed geography (data-only)

- **Location:** `src/data/sectorAnchors.js` merged into `SECTORS` at module load
- Every station, gate, field, and POI carries authored `pos` / `center` / `clusterRadius`
- Procedural scatter reserved for **non-landmark** dressing (debris fields, ambient rocks)
- **Validator:** `npm run check:sector-geography`

### 7. Runtime wiring (shipped data → render path)

- `sectorAnchors.js` sets `archetypeGlb` per station; `world.js` forwards it on spawn (`entity.data.archetypeGlb`)
- Gates default to `place_gate_jump_ring`; POI landmarks forward `landmarkGlb` as `placeId`
- `installVisualOverrides` intercepts stations with `archetypeGlb` → `buildAuthoredStationArchetype` in `partsLibrary.js`
- Station/gate archetypes are whitelisted in `PLACE_FILES`; authored GLBs upgrade on first render via `requestAuthoredUpgrade`
- **Validator:** `npm run check:station-archetype-wiring`
- Local map (N) and star map (M) read fixed anchors — see `WORLD_NAVIGATION_SPEC.md` (UI follow-up)
- World Alive (SPEC2/04) spawns traffic on fixed lane beacons between authored gates/stations (follow-up)

## Vertical slice (starter band)

Proven before scaling to S4–S9:

1. **Sectors:** Helios Prime, Ceres Belt, Tethys Junction
2. **Concept art:** 10 sector overviews + cities/landmarks/ships/planets/people/styles per `assets/concept/index.json`
3. **GLBs:** 4 Blender MCP silhouettes (trade_hub, refinery, military, gate) + procedural_fallback archetypes
4. **Geography:** all 10 sectors anchored; starter band playtested on local map

## Deviations log

See parent goal `plan.md` § Deviations — pipeline doc does not duplicate.