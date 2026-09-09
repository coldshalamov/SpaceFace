# LANE G — FLEET COMPOSITION MATRIX (machine-readable breadth demonstration)

Read `briefs/common.md` first and obey it. You produced the Lane A audit; this lane turns it
into the integration blueprint. Read: `repetition-audit.json` (yours),
`design/foundry/FACTION_SURFACE_LANGUAGE.md` (esp. §12 module preferences + consumption notes),
`assets/ships/foundry/fleet_breadth_20260720/materials/material_profiles.json`,
`tools/foundry/kitgen/kit_manifest.json` (wait for it to exist), the variant candidates in
`assets/ships/foundry/fleet_breadth_20260720/variants/` + `variants_manifest.json`, the decal
atlas `textures/decals_atlas.json`, and the LIVE composition grammar in
`src/render/partsLibrary.js` (whole-ship maps, modular def maps, seed pools — read-only).

## Deliverable 1: `assets/ships/parts/revamp-evidence/fleet_breadth_foundry/fleet_composition_matrix.json`

For every cell of factions × roles that actually occurs on the default route (use your audit:
traffic roles, hostile pools, station-security patrols) PLUS the three hostile-gap roles
(`choir_zealot`, `quiet_ghost`, `lancer_sniper` — currently rendering as production Wasp):

```json
{
  "schema": "sf-foundry-composition/1",
  "cells": [{
    "faction": "faction_dmc",
    "role": "miner",
    "currentLive": {"defId": "ship_pelican", "visual": "wholeships/helios_cradle.glb", "cite": "..."},
    "proposed": {
      "donor": "wholeships/helios_cradle.glb",
      "variantParts": ["var_... or kit families with placement zone"],
      "materialProfile": "faction_dmc",
      "wearTierDistribution": {"fresh": 0.1, "serviceWorn": 0.7, "patched": 0.2},
      "decalSet": ["digit cells for DMC-#### registration", "warn_stripe_block", "..."],
      "socketsUsed": ["..."],
      "expectedRuntimeCost": {"trisAdded": 0, "materialsAdded": 0, "texturesShared": true},
      "integrationRequirement": "exact map/file that must change later, e.g. WHOLE_SHIP map entry; NONE if pure asset swap"
    }
  }],
  "sharedResources": {"kitMaterials": ["KitMat_*"], "atlases": ["decals_atlas.png", "trim_*"], "drawCallStrategy": "..."},
  "cloneFleetProof": {"before": [{"factions": [...], "sharedVisual": "..."}], "after": [{"cell": "...", "distinguishedBy": "construction axes from the bible"}]}
}
```

Rules:
- Every proposed cell must be buildable from EXISTING foundry candidates + kit + profiles — no
  hypothetical assets. Where a needed candidate does not exist yet, put it in a top-level
  `"gaps"` list instead of inventing it in a cell.
- Same-faction cells must share construction language (bible §) across roles; same-role cells
  must diverge across factions on ≥3 named contrast-table axes — name them in `distinguishedBy`.
- `wearTierDistribution` is the place/time depth lever: vary it by sector security in a
  `"sectorModifiers"` note (high-sec skews fresh; fringe skews patched).
- Runtime cost must be arithmetic from real manifest numbers (kit_manifest tris, variant
  manifest tris), not guesses.
- Prefer recomposable donor+parts+profile cells over demanding new complete GLBs.

## Deliverable 2: `.../fleet_composition_matrix.md`

Human summary: the before/after clone-fleet table, a per-faction fleet lineup description
(patrol/miner/hauler/raider/military), the total new-asset cost (tris/textures/materials
added, shared vs unique), and the TOP 5 integration actions (exact file+map, still NOT to be
edited in this batch) ranked by first-hour visibility.

Finish per common protocol (report: `reports/G-MATRIX-REPORT.md`).
