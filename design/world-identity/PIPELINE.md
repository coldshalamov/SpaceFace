# Place-Identity Pipeline — Story → Concept Art → Blender → Release → Fixed Geography

> **Scope:** active pipeline contract, not global completion status. See [`README.md`](README.md)
> for this suite's map and [`../program/README.md`](../program/README.md) for unified status.

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

### Authored-place craft route (required before stage 4)

This pipeline owns story-to-place and geography routing; it does **not** define a separate quality bar
for the resulting GLB. Before substantive Blender/place authoring, read
`assets/ships/AGENTS.md` → `docs/visual-assets/README.md` →
`docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md`. If current player-facing evidence identifies
plastic/clay/LEGO-like primitive construction, an unexplained glowing torus/disk, or a mismatch between
fictional function and visible substance, also load
`.grok/skills/spaceface-blender-material-truth/SKILL.md`.

For that defect class, the fiction/material bill, shape-grammar audit, optional **component-only**
generated reference, and exact-source evidence rules are mandatory. Generated imagery remains
reference-only; if the selected component-reference method needs image generation and the worker lacks
it, use the bounded Codex handoff in `docs/visual-assets/AGENT_PROMPTS.md` § E. When connected Blender
is available, keep the complete surfaced place in Material Preview or Rendered shading as the primary
working state. Headless bootstrap or export commands can diagnose/produce a candidate, but cannot close
G4 material truth or replace exact-source/player-route review.

### 1. Story intake (read-only canon)

- **Sources:** `docs/worldbuilding/story/SECTOR-GRADIENT.md`,
  `docs/worldbuilding/vibe/vibe-CANONICAL.md`,
  `docs/worldbuilding/orgs/factions-CANONICAL.md`, chapter docs.
- **Output:** story↔data mapping (`STORY_SECTOR_MAP.md`) — never overwrite canon prose.
- **Rule:** story names (Tycho Relay, Hollow Station) map to `sector_*` IDs via explicit table.

### 2. Per-area style spec

- **Location:** `design/world-identity/sectors/<sector_id>.md` + `SECTOR_STYLE_INDEX.md`
- **Each spec lists:**
  - Story band + citations
  - Atmosphere and identity references grounded in current world data, assets, and player-facing evidence
  - A signature landmark or other unmistakable place cue when it materially improves navigation/identity
  - Renderable asset roles that the location actually needs (station, gate, landmark, dressing, or others)
  - Procedural vs fixed spawn policy

Palette labels, mood boards, and historical taste tokens are starting vocabulary, not a closed style
system. Each location may choose a stronger direction when it remains coherent, accessible, and legible
in the player route.

### 3. Concept art (image gen → tweak → file)

- **Location:** `assets/concept/` organized by `sectors/`, `factions/`, `archetypes/`, `map/`
- **Index:** `assets/concept/index.json` maps `concept_id → target_asset_role → story_citation`
- **Guidance:** choose the views, annotations, aspect ratio, and reference set that communicate the
  asset's role to the authoring lane. Keep the stable `concept_id` filename/index relationship.
  Existing bibles, sector sheets, and related concepts may inform a direction, but do not override a
  stronger coherent result or become mandatory palette/style matching.

### 4. Blender authoring (longform lane)

- **Bootstrap:** `npm run author:place-archetype -- <part_id>` → Blender build → `finalize_part.mjs` → `authoring.json` **`bootstrap_pending`**
- **Promotion:** `npm run promote:place-archetype -- <part_id>` (or `--all`) validates the source/export,
  records authoring provenance, and appends `iteration_ledger.json`. Its concept-overlap result is a
  diagnostic: use a justified override when player-camera silhouette, identity, or quality evidence is
  stronger than the legacy configured threshold.
- **Tool:** Blender MCP when available — load concept JPG as `REF_<part_id>` in Blender. The current
  authoring/acceptance route is the visual-asset standard above; the legacy Spec2 prompt is a
  compatibility dispatch aid, not a substitute for it.
- **Builder script:** `tools/art/blender/author_place_archetype.py` — a bootstrap for concept-informed
  authoring, not a mandatory geometry or surfacing recipe.
- **Resemblance diagnostic:** `npm run check:place-concept-resemblance` reports concept↔GLB silhouette
  overlap. It can reveal a missed identity target, but no universal score proves visual quality.
- **Provenance:** `authoring.json` records `bootstrap_pending` | `blender_mcp` | `procedural_fallback` per archetype
- **Source saves:** `assets/ships/parts/blender/<part_id>.blend`
- **Export path:** `assets/ships/parts/places/<part_id>.glb` → `node tools/art/finalize_part.mjs <glb> <part_id> --method=blender_mcp`
- **Contract:** the live exporter, loader, and exact `parts_manifest.json` schema own coordinate,
  metadata, material-role, socket/hook, and compatibility requirements. Manifest resource profiles are
  measured alarms, not design ceilings; justify exceptions with screen-space and performance evidence.
- **Prior vertical-slice evidence:** see `BLENDER_ITERATION_EVIDENCE.md`. Its historic overlap values
  are receipts, not promotion criteria for new work.
- **CI/dev fallback:** `procedural_fallback` in `authoring.json` for fab, mining, research until promoted
- **Validators:** `check:station-archetype-glb-load` (provenance + compatibility),
  `probe-station-archetypes-live.mjs` (runtime + method), plus the resemblance diagnostic when it helps
  assess the intended concept relationship.

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

The former parent `plan.md` no longer exists. Record implementation/status changes in the unified
[`design/program/`](../program/README.md) pickup set and record pipeline-specific rationale in the
active packet or evidence receipt. Do not create another competing completion ledger here.
