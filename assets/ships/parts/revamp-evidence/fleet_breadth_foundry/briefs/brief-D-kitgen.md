# LANE D — HARD-SURFACE MICRODETAIL KIT (deterministic Blender/Python generators)

Read `assets/ships/parts/revamp-evidence/fleet_breadth_foundry/briefs/common.md` first and
obey it. You build the reusable microdetail vocabulary every variant lane will bolt onto
donor hulls. **Work strictly TDD: write the check first, then make it green, family by
family. Never move to the next family with a red check.**

## Deliverables

1. `tools/foundry/kitgen/kitgen.py` — pure-function generator library (importable module,
   no top-level side effects). One builder per family:
   `build_<family>(variant: int, seed: int) -> list[bpy.types.Object]`
2. `tools/foundry/kitgen/export_kit.py` — headless entry:
   `"C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" -b --factory-startup -P tools/foundry/kitgen/export_kit.py`
   Generates every family × variant into
   `assets/ships/foundry/fleet_breadth_20260720/kit/kit_<family>_v<NN>.glb`
   plus `kit_manifest.json` (per piece: family, variant, seed, tris, dims_m, material list,
   sha256 of the GLB).
3. `tools/foundry/kitgen/check_kitgen.py` — headless check (same invocation pattern) that
   FAILS with a named assertion when any rule below is violated. Print `KITGEN_CHECK_OK`
   only when all pass. Also write `check_kitgen_report.json` next to the manifest.

## The 14 families (each with 3–5 structurally different variants)

Variants must be DIFFERENT CONSTRUCTIONS, not scale/tint tweaks — the SAME NEED, DIFFERENT
ANSWER rule. Scale: game unit = metre; ships are 8–20 m; these details sit on hull plates.

| family | what it communicates | variant axis examples | size guide (m) |
|---|---|---|---|
| rivet_strip | plates joined by rivets | dome heads / flush countersunk / staggered double row | strip 0.4–1.2 long, head Ø0.03–0.06 |
| fastener_recessed | serviceable bolted seam | slotted recess / hex recess / quarter-turn latches | pitch 0.10–0.20 |
| rail_split | structural rail with center bevel | I-profile / C-channel / boxed with lightening holes | 0.8–2.4 long, 0.08–0.15 wide |
| bracket_gusset | load path into a plate | triangular gusset / ribbed L-bracket / cast lug | 0.1–0.3 |
| plate_lip | overlapping armor seam | stepped lap / raised weather strip / bolted butt-strap | length 0.6–1.6 |
| weld_seam | joined by welding | stitch weld / continuous bead / ground-flush with HAZ ridge | bead Ø0.02–0.04 |
| hatch_frame | crew/service access | dogged oval / square quarter-latch / hinged with piano hinge | 0.4–0.8 |
| access_panel | maintenance opening | flush screwed / raised louvered / quick-release latched | 0.3–0.6 |
| vent_grid | heat/gas exchange | horizontal louvers / hex mesh / angled chevron slats | 0.2–0.6 |
| pipe_clamp | routed conduit held down | saddle clamp pair / block clamp / stand-off loop + junction box | pipe Ø0.05–0.12 |
| armor_spacer | standoff armor mounting | cylindrical stubs / honeycomb strip / rail-mounted | 0.05–0.10 tall |
| heat_shield | engine-adjacent protection | corrugated blanket panel / rigid scalloped plate / layered foil with clips | 0.4–1.0 |
| weapon_collar | weapon root reinforcement | bolted flange ring / clamshell clamp / recoil-brace struts | Ø0.15–0.4 |
| sensor_housing | instruments that face space | canted lens box / mast with dish / conformal blister | 0.15–0.5 |

## Technical rules (the check must enforce every one)

- **Determinism:** builders take `(variant, seed)` and use ONLY `random.Random(seed)`.
  Check: build every piece twice in two separate module reloads → identical vertex counts
  AND identical sorted vertex-coordinate hashes (round coords to 1e-5 before hashing).
- **Budgets:** ≤400 tris per piece target, hard fail >800. Whole kit ≤14 families ×5 ≤ 70
  pieces.
- **Transforms:** all object transforms applied (location=(0,0,0) exception: the piece's
  designed mount offset must be zero — origin at the mount plane, +Z out of the surface,
  +X along the piece's length). Check: `obj.matrix_world` translation/rotation/scale
  identity for every exported object.
- **Bevels:** every structural edge that would catch light gets a small real bevel
  (0.004–0.012 m). No shading-only fakes on silhouette edges. Weighted normals applied
  (bevel weight / weighted-normal modifier applied before export).
- **Naming:** objects `KIT_<FAMILY>_V<NN>[_<part>]`, meshes likewise. No `Cube.001` leaks.
- **Materials:** ONLY these four shared materials, created identically by a helper:
  `KitMat_Steel` (basecolor 0.42/0.43/0.45, rough 0.55, metal 1.0),
  `KitMat_Paint` (0.24/0.25/0.26 neutral — faction tint multiplies at runtime, rough 0.45),
  `KitMat_Rubber` (0.06/0.06/0.07, rough 0.9),
  `KitMat_Emissive` (emission 1.0, color set per-instance later; default #9adcff).
  Check: no other material names exist in the export; material REUSE across pieces (the
  glb per piece may embed them, but names must match exactly for later merge-dedup).
- **UVs:** every mesh gets a non-degenerate UV map (Smart UV Project acceptable,
  island_margin 0.02). Check: UV layer exists, no zero-area islands > 5% of faces.
- **Export:** `export_yup=True, export_apply=True`, GLB. No cameras/lights/empties in kit
  exports.
- **Readability:** each family's variant 1 must read at 32 px (the check can't measure
  this — instead enforce the proxy: the piece's largest form feature ≥ 25% of its bbox).

## Worked pattern to start from

```python
import bpy, bmesh, random
def _rng(seed): return random.Random(seed)
def build_rivet_strip(variant: int, seed: int):
    r = _rng(seed)
    # variant 1: dome heads single row; 2: flush countersunk; 3: staggered double row...
    # build with bmesh ops, apply transforms, assign KitMat_Steel, return [obj]
```

Run headless after EVERY family:
`& "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" -b --factory-startup -P tools/foundry/kitgen/check_kitgen.py`
(from the worktree root; exit code must be 0 and output must contain KITGEN_CHECK_OK).

Do not stop early. If Blender errors, read the traceback, fix, rerun. You are done only
when: all 14 families × ≥3 variants export, check_kitgen exits 0, kit_manifest.json is
complete, and `reports/D-KITGEN-REPORT.md` exists per the common finish protocol.
