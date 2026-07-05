# Blender Iteration Evidence — Honest Provenance

This documents what the shipped vertical slice **proves** vs what remains **human/MCP iteration**.

## Bootstrap vs promotion (two-step lane)

1. **`npm run author:place-archetype -- <part_id>`** — Blender export + `finalize_part.mjs`; sets `authoring.json` method to **`bootstrap_pending`** (not promoted).
2. Human/MCP iteration in `.blend` until silhouette reads like concept at cruise distance.
3. **`npm run promote:place-archetype -- <part_id>`** (or `--all`) — runs measurable **concept↔GLB silhouette IoU** gate; on pass sets **`blender_mcp`** and appends `iteration_ledger.json`.

## Silhouette resemblance gate

- Library: `scripts/lib/silhouette-raster.mjs` (96×96 orthographic, Kestrel raster pattern).
- Check: `npm run check:place-concept-resemblance` (default min IoU **0.12**, override via `PLACE_SILHOUETTE_MIN_IOU`).
- Concept JPG → luminance/chroma threshold; GLB → side-elevation triangle raster; **align/scale + small translation/mirror sweep** before IoU.

## Shipped vertical slice (5 promoted `blender_mcp`)

| ID | IoU | Ledger |
|----|-----|--------|
| `place_station_trade_hub` | 0.6107 | `iteration_ledger.json` |
| `place_station_refinery` | 0.7372 | `iteration_ledger.json` |
| `place_station_military` | 0.3916 | `iteration_ledger.json` |
| `place_station_blackmarket` | 0.4688 | `iteration_ledger.json` |
| `place_gate_jump_ring` | 0.2674 | `iteration_ledger.json` |

Remaining archetypes (`fab`, `mining`, `research`) stay `procedural_fallback` until promoted through the same lane.

## Before / after promotion (measurable)

| Stage | `authoring.json` method | Evidence |
|-------|-------------------------|----------|
| Blender export only | `bootstrap_pending` | GLB + `.blend` on disk; IoU not yet gated |
| IoU gate pass | `blender_mcp` | `iteration_ledger.json` SHA256 + `silhouette_iou` |
| Visual audit | promoted only | `npm run export:place-silhouette-audit` → scratch `silhouette-audit/*_silhouette_audit.png` (concept \| GLB \| overlap) |

Re-running `promote:place-archetype` after mesh edits updates ledger hashes and IoU; a drop below 0.12 blocks promotion.

## What is NOT automated (by design)

- **Pixel-to-mesh extraction** — templates are not auto-sculpted from concept pixels.
- **Texture bake** — factor-only materials ship first; PNG/KTX2 bake is a follow-up pass.

## Iteration workflow (MCP longform)

1. Open `assets/ships/parts/blender/<part_id>.blend` with concept JPG visible.
2. Adjust proportions until silhouette IoU improves (re-run `promote:place-archetype` after export).
3. Add greebles, emissive accents, faction tint slots per sector style spec.
4. Re-export → `author:place-archetype` → `promote:place-archetype` → `check:place-concept-resemblance --verbose`.
5. Live probe: `node scripts/probe-station-archetypes-live.mjs` (Helios + Pallas sectors).