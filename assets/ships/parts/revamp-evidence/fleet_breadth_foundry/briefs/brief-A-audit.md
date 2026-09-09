# LANE A — LIVE REPETITION AUDIT (read-only)

Read `assets/ships/parts/revamp-evidence/fleet_breadth_foundry/briefs/common.md` first and
obey it. This lane is **strictly read-only on game source**: you write ONLY your two output
files + your report.

## Mission

Determine, from live runtime mappings and default-route content — NOT from filenames or
prose docs — what the player actually sees repeated, so downstream lanes know which donors
to vary first. Every claim about a runtime mapping must carry a `file:line` citation.

## Required reading (trace the actual code paths)

1. `src/render/partsLibrary.js` — ALL selection maps: hull-by-defId, whole-ship map,
   role/archetype maps, station archetype files, place files, the generic seed-pick pools,
   `paletteFor`, part scaling rules, LOD handling. This file is large; read it thoroughly.
2. `src/render/visualFactory.js` — which procedural props/stations appear and when the
   procedural fallback shows instead of authored assets.
3. `src/data/factions.js`, `src/data/palettes.js` — faction ids, palettes, paint profiles.
4. `src/data/sectorAnchors.js` + `src/data/frontierRegions/*.js` — every station/place
   anchor with its `archetypeGlb`, sector, and owning faction.
5. `src/systems/world.js` — what spawns on the default route (stations, squads, mining
   traffic, props): which ship defIds, which factions, what counts/weights.
6. Spawn/encounter systems (`src/systems/` — spawnBudget / encounterDirector / ambient
   traffic if present) — which ship defIds each faction actually flies, how often.
7. Ship def sources (wherever defIds map to hulls/roles — e.g. combat/ship def data files).
8. `assets/ships/parts/parts_manifest.json` — READ ONLY — per-part tris/bytes/dims/materials.

## Deliverable 1: `assets/ships/parts/revamp-evidence/fleet_breadth_foundry/repetition-audit.json`

```json
{
  "generatedFrom": "codex/fleet-breadth-foundry-20260720 @ c740ae01",
  "donors": [
    {
      "runtimeId": "hull_fighter",
      "kind": "part|wholeship|place|prop",
      "sourcePath": "assets/ships/parts/hulls/hull_fighter.glb",
      "releasePath": "assets/ships/release/parts/hulls/hull_fighter.glb",
      "manifestMapping": "parts_manifest.json entry summary",
      "runtimeSelection": [{"map": "HULL_FILE_BY_DEF_ID", "cite": "partsLibrary.js:NNN", "defIds": ["..."]}],
      "factionsUsing": ["faction_scn", "..."],
      "rolesUsing": ["patrol", "..."],
      "routeFrequencyEstimate": "how often + WHY (spawn weights, sector counts, cite)",
      "visibleDeficiencies": ["single uniform material over N units", "..."],
      "recommendedReuseStrategy": "e.g. armor-overlay variants ×3 factions; keep silhouette",
      "constraints": {"sockets": [], "pivots": "", "scaleRule": "", "lod": "", "materials": []}
    }
  ],
  "repetitionFindings": {
    "mostRepeatedShipHulls": [],
    "mostRepeatedParts": {"engines": [], "fins": [], "rails": [], "weapons": [], "pods": [], "greebles": []},
    "factionsSharingSilhouettes": [{"factions": [], "sharedAsset": "", "cite": ""}],
    "oversizedSingleMaterials": [{"asset": "", "evidence": "manifest dims/tris vs material count"}],
    "primitiveBarMeshes": [],
    "largestRepeatedFieldProps": [{"asset": "", "where": "", "approxInstanceCount": ""}],
    "detailSurvivability": "which existing details are visible at gameplay distance and which vanish"
  },
  "top10VariationTargets": [{"runtimeId": "", "why": "", "suggestedFamilies": []}]
}
```

Rank `donors` by route frequency × visibility. Include AT LEAST: the top 6 ship
hulls/wholeships actually spawned, the top engines/fins/weapons picked by the seed pools,
every station archetype used by ≥2 factions, and the 4 most-instanced scenery props.

## Deliverable 2: `.../repetition-audit.md`

Human-readable: a one-page executive summary (what a player sees repeated in their first
30 minutes), the top-10 variation targets with reasoning, and a "faction sameness table"
(which factions currently look like recolors of each other and where).

## Method rules

- NEVER infer runtime use from a filename or from `needed-assets.md` prose. If a GLB exists
  but no live map references it, record it as `"runtimeSelection": []` (unreferenced).
- Distinguish "mapped" from "actually spawns on the default route" — a map entry that no
  spawner selects is not repetition the player sees.
- If a mapping is ambiguous, say so explicitly rather than guessing.
- You may run read-only node one-liners (e.g. to parse JSON manifests) but do not install
  anything and do not modify any file outside your two deliverables + report.

Finish per the common finish protocol (report file: `reports/A-AUDIT-REPORT.md`).
