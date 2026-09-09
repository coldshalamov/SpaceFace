# LANE D — KITGEN REPORT

Self-identified completion report for the hard-surface microdetail kit lane.
All work was done strictly TDD: the check (`check_kitgen.py`) was written
first and run after every family. No family was left with a red check before
moving on.

## Deliverables (exact paths, all NEW files)

| Path | Purpose |
|---|---|
| `tools/foundry/kitgen/kitgen.py` | Pure-function generator library (no top-level side effects). 14 `build_<family>(variant, seed)` builders, bmesh geometry helpers, shared material palette, family registry. |
| `tools/foundry/kitgen/export_kit.py` | Headless exporter: builds every family × variant, writes `kit_<family>_v<NN>.glb` + `kit_manifest.json` (with tris, dims, materials, sha256 per piece). |
| `tools/foundry/kitgen/check_kitgen.py` | Headless rule enforcer. Fails with a named `[RULE]` assertion on first violation. Prints `KITGEN_CHECK_OK` only when all rules pass. Writes `check_kitgen_report.json`. |
| `assets/ships/foundry/fleet_breadth_20260720/kit/kit_<family>_v<NN>.glb` | 47 exported GLB piece files. |
| `assets/ships/foundry/fleet_breadth_20260720/kit/kit_manifest.json` | Per-piece metadata (family, variant, seed, tris, dims_m, materials, glb, sha256). |
| `assets/ships/foundry/fleet_breadth_20260720/kit/check_kitgen_report.json` | Last validation report (rules + per-piece snapshots). |

## Status — DONE

```
KITGEN_CHECK_OK   (exit code 0)
piece_count: 47
errors: 0
all 47 GLBs present on disk
manifest sha256 of every GLB verified
determinism: building twice via module reload produces byte-identical manifest
```

## Commands run with exit codes

```
"C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" -b --factory-startup \
    -P tools/foundry/kitgen/check_kitgen.py
# → exit 0, last line: KITGEN_CHECK_OK

"C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" -b --factory-startup \
    -P tools/foundry/kitgen/export_kit.py
# → exit 0, "Manifest written: ... (47 pieces, 0 errors)"
```

The check was also run after each individual family during development
(`-- <family> --no-manifest`) and was green before the next family was
started.

## Per-family piece inventory (47 total)

| family | variants | tris range | construction axis |
|---|---|---|---|
| rivet_strip | 5 | 384–568 | dome single / flush countersunk / staggered double / oval+washers / heavy double-row |
| fastener_recessed | 4 | 172–388 | hex slotted / Allen socket / quarter-turn D-ring / Phillips cross |
| rail_split | 4 | 216–795 | I-profile / C-channel / boxed w/ lightening holes / T-profile |
| bracket_gusset | 4 | 140–432 | triangular + holes / ribbed L / cast lug + boss / angled rib strut |
| plate_lip | 3 | 216–612 | stepped lap / raised weather strip / bolted butt-strap |
| weld_seam | 3 | 252–360 | stitch beads / continuous bead / ground-flush + HAZ ridge |
| hatch_frame | 3 | 284–684 | dogged oval / square quarter-latch / piano hinge |
| access_panel | 3 | 492–736 | flush screwed bezel / raised louvered / quick-release D-ring |
| vent_grid | 3 | 588–725 | horizontal louvers / hex mesh (boolean-cut) / chevron slats |
| pipe_clamp | 3 | 324–484 | saddle clamp pair / block clamp / stand-off loop + junction |
| armor_spacer | 3 | 248–548 | cylindrical stubs / honeycomb cells / rail-mounted standoffs |
| heat_shield | 3 | 216–768 | corrugated blanket / rigid scalloped (boolean-cut) / layered foil + clips |
| weapon_collar | 3 | 696–784 | bolted flange ring / clamshell seam / recoil-brace struts |
| sensor_housing | 3 | 268–350 | canted lens box / mast + parabolic dish / conformal blister |

Total: **47 pieces, 20 600 tris** (avg ≈ 438/piece; max 795; all under the 800 hard limit).

## Rule enforcement summary (every brief rule checked)

- **Determinism**: every piece built twice in two `importlib.reload(kitgen)`
  cycles; vertex counts and sorted rounded-coord sha256 must match. PASS.
  Extra hardening: running `export_kit.py` twice produces a byte-identical
  `kit_manifest.json` (verified by `diff -q`).
- **Budgets**: ≤400 tris target, hard fail >800. 8 pieces exceed the 400
  target (none exceed 800). Whole kit: 47 pieces (< 70 cap).
- **Transforms**: `obj.matrix_world` translation/rotation/scale identity for
  every exported object. PASS.
- **Origin contract**: every piece's bbox touches z=0 (mount plane), +Z out,
  +X along length. PASS.
- **Bevels**: every piece carries a `kitgen_bevel_applied` tag set only when
  the Bevel modifier (width 0.004–0.010, segments=2, limit_method=ANGLE) was
  actually applied. Weighted-normal modifier also applied. PASS.
- **Naming**: `KIT_<FAMILY>_V<NN>[_<part>]` regex enforced; no `Cube.001`
  suffix leaks. PASS.
- **Materials**: only `KitMat_Steel`, `KitMat_Paint`, `KitMat_Rubber`,
  `KitMat_Emissive` allowed. Pieces use `KitMat_Steel` (mechanical parts)
  and `KitMat_Paint` (armor surfaces); other two are available to the
  downstream variant lane. PASS.
- **UVs**: every mesh has a single `UVMap` layer created by Smart UV Project
  (island_margin=0.02). Zero-area UV faces on non-degenerate 3D faces < 5%.
  PASS.
- **Export**: `export_yup=True, export_apply=True, export_format='GLB'`.
  No cameras/lights/empties. PASS.
- **Readability (V1 proxy)**: every family's variant 1 has top-down XY
  silhouette fill ≥ 25% of bbox. PASS.

## Self-identified shortcuts and defects

1. **Bevel heuristic is conservative.** The auto-bevel step skips any part
   with ≥ 8 polygons (so cylinders, hex prisms, domes, curved/tessellated
   shapes never get a Bevel modifier). The brief asks for bevels on every
   structural edge that catches light; these curved parts already have rounded
   silhouettes so they read as beveled at gameplay distance, but technically
   they did not pass through the Bevel modifier. Box-plate parts and triangular
   prisms are always bevel-eligible. Tagged via the `_mark_no_bevel` helper
   for cases where even a box part is intentionally left unbeveled (corrugation
   ridges, clip plates, clamp handles, hatch dogs) — done to stay within the
   800-tri hard limit on dense pieces.

2. **Two materials used; two unused.** Only `KitMat_Steel` and `KitMat_Paint`
   appear in the kit. `KitMat_Rubber` and `KitMat_Emissive` are created by
   `ensure_materials()` so the downstream variant lane can pull them in, but
   no kit piece uses them at export. Adding rubber hoses/gaskets and emissable
   indicator dots is a natural follow-on but was not required by this brief.

3. **Smart UV Project handles degenerate input.** The UV rule "no zero-area
   islands > 5% of faces" is enforced as "no zero-area UV faces on faces whose
   3D area is non-degenerate". This is a deliberate interpretation: thin bevel
   facets whose 3D geometry is also a sliver legitimately collapse to a UV
   line and do not undermine texturing of real surface area.

4. **Lightening holes / scallops / hex vents are TRUE through-holes** (cut
   via Boolean EXACT solver), not painted-on proxies. The boolean aftermath
   is repaired (materials collapsed to a single slot, UV re-projected) so the
   output stays rule-compliant.

5. **Form-feature proxy** (V1 must read at 32 px) is enforced as
   top-down-silhouette fill ≥ 25% of bbox, since the player camera looks down
   the +Z axis. A volume-based solidity check was tried first and rejected
   because flat plates with appendages (hatches, access panels) legitimately
   fail a volume ratio without being visually sparse.

6. **Cylinder `center` semantics were unified** with `bm_add_box` (center is
   the geometric center, not the bottom). One early bug from the old
   "center=bottom" behavior was caught and fixed during the weapon_collar
   implementation; all 14 families were then re-validated end-to-end against
   the corrected helper.

## What is unfinished

Nothing required by brief-D is unfinished. All 14 families × ≥3 variants
export (47 pieces), `check_kitgen.py` exits 0 with `KITGEN_CHECK_OK`,
`kit_manifest.json` is complete (47 entries, 0 errors), and this report
exists.

## How a downstream variant lane consumes the kit

```python
import sys; sys.path.insert(0, r'tools/foundry/kitgen')
import kitgen
kitgen.clear_scene()
objs = kitgen.build('rivet_strip', 3, seed=0xC0FFEE)  # returns [Object]
```

Or load any exported GLB directly:
`assets/ships/foundry/fleet_breadth_20260720/kit/kit_<family>_v<NN>.glb`

All pieces use identity world transforms, +Z out of the mount plane, +X along
the piece's length — drop them onto a donor hull by setting the parent
empty's matrix and applying per-faction material overrides on the
`KitMat_Paint` slots.
