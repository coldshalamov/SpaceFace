# Lane A — LIVE REPETITION AUDIT — Report

**Lane:** A (read-only audit)
**Worktree:** `C:\Users\93rob\sf-fleet-breadth`
**Branch / HEAD:** `codex/fleet-breadth-foundry-20260720` @ `c740ae01`
**Date:** 2026-07-20

## Deliverables

| File | Path | Status |
|---|---|---|
| Machine audit | `assets/ships/parts/revamp-evidence/fleet_breadth_foundry/repetition-audit.json` | Written |
| Human audit | `assets/ships/parts/revamp-evidence/fleet_breadth_foundry/repetition-audit.md` | Written |
| This report | `assets/ships/parts/revamp-evidence/fleet_breadth_foundry/reports/A-AUDIT-REPORT.md` | Written |

No game source, manifests, release assets, or design/program files were modified.

## Commands run (read-only)

| Command | Exit | Purpose |
|---|---:|---|
| `git status --short; git log -1 --oneline; git rev-parse …` | 0 | Confirm worktree branch/HEAD |
| PowerShell size checks on key sources | 0 | Scope large files |
| Multiple `rg`/grep reads over `partsLibrary.js`, `visualOverrides.js`, `world.js`, `traffic.js`, `combat.js`, data files | 0 | Map selection + spawn paths |
| `node --input-type=module -e …` manifest/anchor/enemy/ship aggregations | 0 | Count archetypes, manifest tris/bytes, traffic role shares, frequency estimates |
| `node` line-number locator for citation anchors | 0 | Stable `file:line` cites |

No packages installed. No git write operations. No Blender.

## Coverage checklist

| Required read | Done | Notes |
|---|---|---|
| `partsLibrary.js` selection maps | Yes | STATION/PLACE, HULL/ENGINE/WHOLE_SHIP_*, seed pools, paletteFor, scaling, LOD notes |
| `visualFactory.js` procedural path | Yes | `buildShipMesh` / `createVisualFactory`; live route wraps via overrides with directAuthoredMount |
| `factions.js` / `palettes.js` | Yes | factions re-exports kits; 14 `FACTION_PALETTES` |
| `sectorAnchors.js` + frontier regions | Yes | archetype counts CORE+frontier; station faction matrix from `sectors.js` |
| `world.js` default-route spawns | Yes | stations, gates, dressing, enemies, pools |
| Spawn/encounter systems | Yes | traffic, encounterDirector spawn API, sectorZones presence templates, spawnBudget headroom |
| Ship/enemy defs | Yes | `ships.js`, `enemies.js`, `makeEnemySpawnSpec` |
| `parts_manifest.json` | Yes | tris/bytes/dims/tintable for donors |

## Key findings (honest)

1. **First-hour repetition is traffic + stations + props**, not combat variety (Helios `enemyDensity: 0`).
2. **Faction sameness is palette-driven** (`paletteFor`); construction is shared across owners for Helios civvies, production Wasp patrols, and multi-faction station archetypes.
3. **Hostile whole-ship map is incomplete** — reaver/corsair share `ashline_rig`; several enemy types fall through to production Wasp or modular hulls.
4. **Modular fin/cockpit variety exists but is seed-only**, so it does not teach faction culture.
5. **`hull_gunship` and some legacy wholeships are library/manifest inventory, not live route donors.**

## Frequency model caveat

Route ranks use a **time-weighted concurrent presence estimate** (Helios-heavy first 30 minutes), derived from authored weights/densities/dressing caps. This is not a telemetry capture of a live play session. Ordering is robust; absolute numbers are approximate.

## Self-identified shortcuts / defects

- Did not byte-open every GLB for material draw counts beyond manifest `tintable` keys and notes (manifest is the contract source for tris/bytes/dims).
- EncounterDirector shape weights were not fully expanded per-sector schedule (ambient first-hour is traffic-dominated; director noted as late-route additive).
- Frontier station **factions** were inferred from sector ownership patterns where frontier station objects lack inline faction fields; archetype **counts** are hard from anchors.
- `place_dock_interior*` documented as UI-only after finding `shipPreviewMount.js` maps — correct non-flight note.

## Unfinished

None for Lane A scope. Downstream lanes can consume `top10VariationTargets` and multi-faction station list immediately.

## Exit condition

Audit deliverables complete; claims about runtime mappings carry `file:line` citations in JSON/MD.
