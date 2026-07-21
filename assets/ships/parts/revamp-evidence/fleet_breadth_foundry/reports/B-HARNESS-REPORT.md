# Lane B — Render/Validation Harness Report

**Branch:** `codex/fleet-breadth-foundry-20260720`   **Worktree:** `C:\Users\93rob\sf-fleet-breadth`
**Date:** 2026-07-20   **Lane:** B (pipeline harness)

The harness every other lane uses to prove candidate assets: a deterministic Blender
contact-sheet renderer, a GLB budget/contract validator, and a donor contract-surface
dumper — plus the one-page contract doc.

## Deliverables (all new files)

| # | Path | Status |
| --- | --- | --- |
| 1 | `tools/foundry/render_contact_sheet.py` | DONE — dual-mode (system PIL orchestrator + Blender renderer), 20-view set, deterministic contact sheet |
| 2 | `tools/foundry/validate_foundry_glb.mjs` | DONE — @gltf-transform inspect + document walk, budget PASS/FAIL, non-zero exit on FAIL |
| 3 | `tools/foundry/import_donor.py` | DONE — dual-mode; also importable as a Blender module by the variant lane |
| 4 | `design/foundry/FOUNDRY_CONTRACT.md` | DONE |
| — | `assets/ships/parts/revamp-evidence/fleet_breadth_foundry/renders/smoke/` | 2 contact sheets + 2×20 view PNGs + 2 `_views.json` |
| — | `assets/ships/parts/revamp-evidence/fleet_breadth_foundry/reports/smoke/` | 2 validation reports + 2 contract-surface JSON |
| — | this report | DONE |

## Camera constants extracted from `src/render/camera.js`

- **FOV 50°** vertical (Three.js `PerspectiveCamera` fov; `state.settings.video.fov || 50`).
- **Tilt 60°** = camera elevation above horizontal (offset `(0, D·sin60, -D·cos60)`, lookAt
  origin ⇒ steep top-down, 30° off nadir). `DEFAULT_ZOOM` 72 wu.
- Part axes (Blender Z-up, post-import): **+X thrust/forward, +Y beam, +Z up = dorsal.**

## Commands run + exit codes

| Command (abbreviated) | Exit |
| --- | --- |
| Blender headless probe: import GLB + Cycles render (import 0.06s, render 2.45s @384/24) | 0 |
| `python render_contact_sheet.py --glb hull_fighter.glb --out … --fast --views neutral_close,game_cam` (spine) | 0 |
| `python render_contact_sheet.py … --fast --views <8 incl channels>` (fanout) | 0 |
| **Full smoke:** `python render_contact_sheet.py --glb hull_fighter.glb --glb engine_ion_twin.glb --out …/renders/smoke` (2×20 views @512/64) | 0 (20/20 each) |
| `node validate_foundry_glb.mjs hull_fighter.glb engine_ion_twin.glb --out …/reports/smoke --class variant` | 0 (both PASS) |
| `node validate_foundry_glb.mjs hull_fighter.glb --class kit` (FAIL-path proof) | 1 |
| `python import_donor.py --glb engine_ion_twin.glb` / `--glb hull_fighter.glb --out …` | 0 |
| Determinism: render twice, sha256 view PNGs + contact sheet + import/validate JSON | all IDENTICAL |

## Smoke-test results (2 real donors)

- **`hull_fighter`** (4690 tris, 3 mats, 9 render meshes; LOD1/LOD2 SILHOUETTE proxies
  hidden): 20/20 views render; clean black-on-white silhouette; faithful game-cam
  (nose up-screen); clean 8-step turntable. Validator PASS @variant. Contract surface:
  root `HULL_FIGHTER_ROOT`, 7 attachments (5 MOUNT + 2 SOCKET), forward-axis **X** ✓.
- **`engine_ion_twin`** (5664 tris, 3 mats, 17 render meshes, no LODs): 20/20 views; twin
  pods compose with **no z-fighting/double-render** (LOD0_MAIN + Static_*_Merged +
  HOOK_DRIVE_* are complementary, polys sum exactly to 5664); `normal` view reads proper
  lavender (real neutral normal map); metallic near-white (correct). Validator PASS
  @variant. Contract surface: forward-axis longest = **Y** (honest HEADS-UP: twin layout
  spreads laterally; thrust still +X).

## Determinism (batch rule 4) — MEASURED, not asserted

Rendered the same GLB twice and sha256-compared. Cycles pixel data (IDAT) is byte-identical
run-to-run (CPU, seed 0, no animated seed, no adaptive sampling, OIDN). The only run-to-run
difference was Blender's volatile PNG metadata (`Date`/`Time`/`RenderTime` tEXt chunks); the
system phase strips all but a deterministic chunk allowlist. Result: **every delivered view
PNG, contact sheet, and JSON artifact is byte-identical across runs.** Confirmed on the actual
shipped config — a **64-spp path-traced lit** view (`neutral_close`) and a `turntable_00` frame
both reproduce byte-for-byte on a double run — as well as emission-only `silhouette` at 64 spp
and lit views at 24 spp; and the delivered evidence `silhouette.png` equals a fresh render.

## Self-identified substitutions / defects / shortcuts (honest)

1. **AO view = geometric Cycles AO node**, not a baked `occlusionTexture` (donors carry
   none). Documented in the contract; it is the more useful read regardless.
2. **Channel views render literal texel values** (Standard transform): dark assets read
   dark. `hull_fighter`'s `basecolor`/`normal`/`roughness` views are near-black because the
   hull is dark gunmetal — truthful, not a rendering failure. `engine_ion_twin`'s channels
   read fully. This is the correct behavior for an inspection tool.
3. **Real donor finding surfaced by the harness:** `hull_fighter`'s material wires the
   *color* trim-sheet into the **normal** texture slot, leaving a proper
   `hull_fighter_trim_sheet_1k_normal_role` texture unused — so its `normal` view reads dark
   instead of lavender. Left as-is (not ours to fix); flagged for the integration lane.
4. **PIL is not available inside Blender** (bundled Python 3.13, numpy 2.3, no PIL) — hence
   the dual-mode design: system Python composites the labeled sheet; Blender only renders.
5. **Draco GLBs unsupported** by the Node validator (no `draco3d` dep; `meshoptimizer` is
   present). Foundry parts must stay uncompressed or meshopt-packed. Documented.
6. Filmic view-transform detection: Blender 5.1 does not expose the OCIO `view_transform`
   enum via `bl_rna.enum_items` (returns `['None']`); the harness probes by direct
   assignment instead. Confirmed `Filmic` selected (see sheet header `xf=Filmic`).
7. The neutral rig is intentionally brighter than the in-game moody grade — this is an
   inspection rig meant to reveal construction, not reproduce gameplay mood.

## Unfinished / not in scope

- None of the 4 deliverables are unfinished. Steps 2–4 of the "candidate → real pipeline"
  path (finalize_part.mjs → parts_manifest → release build) are **reference only** per the
  brief and touch forbidden files; not executed.
- No git writes performed (orchestrator commits). No forbidden files touched.

## Performance notes (for other lanes)

- Full 20-view sheet @512/64-samples: ~90–120 s/part on CPU Cycles (one Blender process per
  GLB, startup + import amortized across all views). `--fast` (24 smp / 384px) ≈ 20 s/part.
- Validator + import_donor are seconds each.
