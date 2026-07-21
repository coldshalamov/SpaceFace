# Lane G — Fleet Composition Matrix Report

**Lane:** G (matrix)  
**Batch:** `fleet_breadth_20260720`  
**Branch / worktree:** `codex/fleet-breadth-foundry-20260720` @ `C:\Users\93rob\sf-fleet-breadth`  
**Schema:** `sf-foundry-composition/1`  
**Live code modified:** none (read-only on `src/render/partsLibrary.js`, audit, foundry candidates)

---

## Deliverables

| Path | Role |
|---|---|
| `assets/ships/parts/revamp-evidence/fleet_breadth_foundry/fleet_composition_matrix.json` | Machine-readable matrix (44 cells + gaps + costs + top5) |
| `assets/ships/parts/revamp-evidence/fleet_breadth_foundry/fleet_composition_matrix.md` | Human summary (clone table, faction lineups, costs, TOP 5) |
| `assets/ships/parts/revamp-evidence/fleet_breadth_foundry/tools_g_build_matrix.py` | Deterministic builder (reproduces both files byte-identical) |
| `assets/ships/parts/revamp-evidence/fleet_breadth_foundry/reports/G-MATRIX-REPORT.md` | This report |

---

## Commands run (with exit codes)

| Command | Exit | Notes |
|---|---:|---|
| `python assets/ships/parts/revamp-evidence/fleet_breadth_foundry/tools_g_build_matrix.py` | **0** | Writes JSON + MD; `cells=44` |
| Re-run same command | **0** | SHA-256 of JSON and MD unchanged across runs |
| Inline Python schema asserts on JSON | **0** | schema, wear sums, required fields, gap roles present |

**Determinism evidence**

- `fleet_composition_matrix.json` SHA-256: `09D1603B3DA31440CD84C774C4B585EDA49CE0641DE7433A3D0FEA63B46FB346` (stable across two runs)
- `fleet_composition_matrix.md` SHA-256: `321357411E2E82E573DEF42B905086D699E6F46B2E2EF0087FDF5AC84AA9C350` (stable across two runs)

No git write commands. No edits to live maps, release, or `parts_manifest.json`.

---

## Sources consumed (read-only)

- `repetition-audit.json` — live donors, traffic/hostile frequency, whole-ship map gaps
- `design/foundry/FACTION_SURFACE_LANGUAGE.md` — §1–§8 + 12-axis contrast table + consumption notes
- `materials/material_profiles.json` — 8 faction profiles + preferred kit families + wear tiers
- `kit/kit_manifest.json` — 47 pieces, per-piece tris (arithmetic source)
- `variants/variants_manifest.json` — Lane F `tris_added` for span/rig/weapon variants
- `variants/hero_manifest.json` — wasp + trade-hub overlay tris
- `textures/decals_atlas.json` — 66 cells (`fac_*`, `warn_*`, `serv_*`, `wear_*`, `char_*`)
- `scenery/scenery_manifest.json` — prop tris (shared resource rollup)
- `src/render/partsLibrary.js` — `WHOLE_SHIP_FILE_BY_*`, hull/engine maps (read-only)
- `src/data/enemies.js` — hostile roles including gap trio
- `src/systems/traffic.js` — traffic roles / sector faction stamp

---

## Matrix coverage

**44 cells** across factions:

`faction_scn`, `faction_mts`, `faction_dmc`, `faction_free`, `faction_reach`, `faction_quiet`, `faction_choir`

**Roles covered**

- Traffic: patrol, escort, hauler, courier, miner, express, smuggler, rescue, pirate  
- Station security / lawful hostile: patrol_lawman, customs_cutter  
- Hostile pool: reaver_pirate, corsair_raider, wasp_swarmer, bruiser_brawler, mine_layer_jackal, pd_screen_escort  
- **Required gaps:** lancer_sniper, choir_zealot, quiet_ghost  
- Landmark station: station_trade_hub (SCN/MTS/Free)  
- Cross-cutting modular gun: weapon_pulse_default (SCN/DMC/Reach)

**Not invented as ready assets:** 14 entries in top-level `gaps[]` (cradle/lark faction bakes, DMC wasp, Vael organic kit, blackmarket overlays, dedicated lancer body, etc.). Cells that need those use **kit packs with arithmetic tris** from `kit_manifest.json` instead.

---

## Cost arithmetic (not guesses)

Foundry **unique candidate geometry** (from manifests):

| Bucket | Tris |
|---|---:|
| Kit library (47 pieces, shared) | 20,600 |
| Lane F variant overlays (`tris_added`) | 12,092 |
| Hero wasp overlays (`tris_added`) | 3,516 |
| Hero trade-hub overlays | 9,308 |
| Scenery props | 15,798 |
| **Sum** | **61,314** |

*(Matches JSON `costRollup.foundryCandidateGeometryTris`. Per-instance `trisAdded` on each cell is runtime overlay cost, not this library sum.)*

Example verified cell costs:

| Cell | Basis | trisAdded |
|---|---|---:|
| SCN patrol | hero wasp scn `12126−11526` | 600 |
| MTS hauler | variants_manifest `var_helios_span_mts_sealed_v01` | 2,028 |
| DMC hauler | `var_helios_span_dmc_orebox_v01` | 4,560 |
| reaver_pirate | `var_ashline_rig_reaver_hook_v01` | 828 |
| corsair_raider | blade + pirate cannon | 1,332 + 388 = 1,720 |
| choir_zealot | kit pack sum | 3,998 |
| trade hub MTS | hero hub overlay | 4,800 |

**Textures:** 12 unique shared maps (atlas + trim×3 + masks×8).  
**Materials per cell:** 0 unique — shared `KitMat_*` + donor mats + tint.

---

## Clone-fleet proof (summary)

**Before:** multi-faction same GLB + palette tint only (Wasp patrol, Helios civilian trio, ashline_rig dual-role, gap Wasps, trade hub recolor).

**After:** construction axes from bible (segmentation / fasteners / repair / modules / emissive / decals) drive donor+variant/kit+profile cells. Same-faction cells share preferred kit families and repair practice; same-role cells name ≥3 contrast axes in `distinguishedBy`.

---

## TOP 5 integration actions (still NOT done this batch)

1. Faction-fork `ship_wasp` whole-ship for patrol/escort → SCN/MTS/Free vars  
2. Faction-fork `WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE.hauler` → Span MTS/DMC/Reach vars  
3. Trade-hub faction overlays on station place path  
4. Split reaver/corsair maps + add lancer/choir/quiet hostile whole-map entries  
5. Faction `weaponRecordFor` barrels + law interceptor kit on modular hornet  

Exact file+map text lives in JSON `top5IntegrationActions` and the MD section.

---

## Self-identified defects / shortcuts

1. **No baked cradle/lark/DMC-wasp variants** — matrix is honest via kit packs + `gaps[]`, but first-hour miner/courier breadth still depends on a kit-attach runtime that does not exist yet.  
2. **Lancer/choir/quiet still propose wasp_production donor** — closes the *identity* gap with kit+profile+hostile map, not a full silhouette redesign (called out as preferred long-term unique donors in gaps).  
3. **Vael has no ship cells** — correct for first-hour route; bible forbids rectangular kit on Vael without organic re-proportion.  
4. **Express cell** notes live inconsistency (modular freighter vs Span hauler) and prefers future remap rather than inventing a fake express GLB.  
5. **Station/scenery dressing** (lane beacons, buoys, gates) appear in gaps / shared resources, not as full faction×role ship cells — traffic/hostile scope prioritized per brief.  
6. **Builder lives under evidence** (`tools_g_build_matrix.py`) rather than `tools/foundry/` — intentional so orchestrator can regenerate without touching protected tool trees; no live pipeline wiring.  
7. **Wear sector modifiers** are documented as renormalize deltas, not a full runtime wear system design.

---

## Unfinished (out of lane scope)

- Any write to `partsLibrary.js` / release / manifests (forbidden).  
- Baking missing gap GLBs (other lanes or follow-on).  
- Runtime kit-attach compositor.  
- Player-route visual proof of integrated cells (integration batch).

---

## Honesty status

**PASS** for Lane G documentation deliverables: machine matrix + human summary + arithmetic costs + gaps list + deterministic rebuild.  
**Not claimed:** live game breadth improved (integration maps untouched by contract).
