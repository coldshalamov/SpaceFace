# Quality Ritual — Screenshot-Driven Iteration

**Mandatory for all Thread A, B, and E work.** Thread C and D use the verification cycles in their thread docs unless claiming a visual change.

## Iteration floors (non-negotiable)

| Asset class | Min iterations | Examples |
|-------------|----------------|----------|
| **Hero / complex 3D** | **20** | Hulls, capitals, faction stations, wholeships, landmarks |
| **Standard part 3D** | **20** | Engines, weapons, cockpits, fins, greebles |
| **Small prop / rock** | **10** | Nav buoys, debris chunks, simple asteroids |
| **Code / wiring** | **10 verify cycles** | `check:*` green, break-fix-restore once |
| **Integrate pass** | **1 full gate** | `INTEGRATION_GATE.md` checklist |

An iteration = **render → assess → change → render again**. Skipping assessment does not count.

## Camera framing law (SpaceFace 60° chase)

Game camera is ~60° elevated rear chase. Every asset must be shot from angles that match in-game readability:

| Shot ID | Purpose | Distance |
|---------|---------|----------|
| `clay_34_full` | Silhouette read at game scale | `dist = 1.05 × max(bounds)` for parts; `1.15×` for stations |
| `clay_front` | Nose / forward identity | same dist |
| `clay_side` | Profile width | same dist |
| `clay_top` | Planform (ships/places) | same dist |
| `lit_34_full` | PBR + emissive in HDRI | same dist |
| `lit_close_detail` | Macro wear, bevels, decals | `0.45×` dist on hero surface |
| `lit_nozzle` / `lit_muzzle` | Engine/weapon emissive | `0.35×` on exhaust/barrel |

**If any shot crops the subject:** redo at wider distance before counting the iteration.

## Per-iteration workflow

1. **Render** clay + lit set (MCP viewport or `finalize_part.mjs` path).
2. **Save** to `assets/ships/parts/revamp-evidence/<id>/renders/` with date + iter number.
3. **Assess** against rubric below — write ≥5 specific deficiencies (≥8 for hero).
4. **Name techniques** from `.grok/skills/spaceface-blender-pipeline/references/professional-techniques.md` you will apply next.
5. **Apply** one focused pass (modeling OR surfacing OR life — not all three in one iter).
6. **Increment** `iteration_ledger.json` in evidence folder:

```json
{ "iter": 7, "pass": "surfacing", "deficiencies_addressed": ["DET_soot_vent", "trim_sheet_wear"], "shots": ["2026-07-08_engine_vector_iter7_lit_34_full.png"] }
```

## Deficiency rubric (score each 1–5 every iter)

| Criterion | Fail signals |
|-----------|--------------|
| **Silhouette** | Reads as blob at `clay_34_full`; confusable with another part class |
| **Macro/meso/micro** | Flat slabs; no panel steps; greeble noise without hierarchy |
| **Bevel language** | Razor edges; ngons on hero curves; bevel seg < 2 on hard edges |
| **Material zones** | Single gray; accent/hull/mechanical not distinguishable in lit pass |
| **Wear/story** | Factory-fresh on Pit/Belt assets; no decals/stencil/soot per `needed-assets.md` role |
| **Scale truth** | Bounds wrong vs manifest `dimensionsM`; mount origin lies |
| **Lighting readability** | Emissive blows out; no form in shadow; bloom soup |

**Pass bar for export:** no criterion below **4** on hero surfaces; silhouette and scale truth must be **5**.

## Reference comparison (every iter ≥3)

Load side-by-side:

- Same-class concept from `assets/concept/` or bible `assets/bible/B-002_ship_materials.jpg`
- Previous iter render
- Optional: Eve / user ref (mental bar — "would this pass a 2026 ArtStation WIP thread?")

## Forbidden "done" claims

- "Loads in Blender" — not done
- "Exported GLB" — not done (needs release + checks)
- "Looks fine to me" without saved screenshots — not done
- One turntable only — not done (full shot set required)
- Iteration count < floor — not done

## Evidence bundle (required at handoff)

```
revamp-evidence/<id>/
  deficiency.md          # before/after narrative
  iteration_ledger.json  # all iters counted
  renders/               # full shot sets per iter (keep last 3 iters minimum)
  finalize.log           # exporter output
```

## Thread D visual claims

If Thread D changes anything visible, capture:

- `.devshots/<thread-id>/<change>-wide.png`
- `.devshots/<thread-id>/<change>-close.png`

Run `npm run check:visual-stability` before claiming done.