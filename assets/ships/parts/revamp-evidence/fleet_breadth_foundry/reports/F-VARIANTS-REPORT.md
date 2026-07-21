# LANE F — EXTERIOR VARIANT FAMILIES REPORT

Self-identified completion report for the donor-derived faction variant lane.
All work was done strictly TDD: `check_variants.py` was written first and run
after every iteration. No variant was left with a red check before moving on.

**Branch:** `codex/fleet-breadth-foundry-20260720`  **Worktree:** `C:\Users\93rob\sf-fleet-breadth`
**Date:** 2026-07-20  **Lane:** F (exterior variant families — helios_span, ashline_rig, weapon_pulse_cannon)

---

## PART 1 — Kit repair: `kit_bracket_gusset_v04`

The lead's vision review flagged `kit_bracket_gusset_v04` (the `_bracket_angle_rib`
builder in `tools/foundry/kitgen/kitgen.py:1093`) as rendering as a diagonal rod
and two pads that DO NOT TOUCH. The original code rotated the strut 45° about Y,
but the two pads were separated along Y — so the strut swept through the X-Z
plane and never intersected either pad volume.

### Fix applied (`tools/foundry/kitgen/kitgen.py:1093-1140`)

Replaced the fixed-Euler rotation with a geometrically-derived pad-to-pad
vector. The strut is now built Z-aligned, then rotated via
`Vector.rotation_difference(strut_vec)` so its local +Z aligns with the actual
pad-to-pad direction, and translated to the strut midpoint. Each end embeds
`thick*0.5` past the pad centre into the pad volume, so the rod and pads
overlap as one connected assembly (the pads are at least `thick` thick, so the
embedded endpoint stays inside the pad and never pokes out the far side).

### Verification (in addition to check_kitgen staying green)

`tools/foundry/kitgen/verify_bracket_v04_connectivity.py` rebuilds the
pre-join parts for sizes 0.10, 0.15, 0.20, 0.25, 0.30 m (the full brief envelope)
and confirms the strut bbox INTERSECTS both pad bboxes in every case:

```
size=0.10  strut dims=(0.0140,0.0620,0.0970) longest/shortest=6.93  overlaps pad_bot=True  overlaps pad_top=True
size=0.15  strut dims=(0.0150,0.0879,0.1404) longest/shortest=9.36  overlaps pad_bot=True  overlaps pad_top=True
size=0.20  strut dims=(0.0200,0.1172,0.1872) longest/shortest=9.36  overlaps pad_bot=True  overlaps pad_top=True
size=0.25  strut dims=(0.0250,0.1465,0.2340) longest/shortest=9.36  overlaps pad_bot=True  overlaps pad_top=True
size=0.30  strut dims=(0.0300,0.1759,0.2809) longest/shortest=9.36  overlaps pad_bot=True  overlaps pad_top=True
BRACKET_V04_CONNECTIVITY_OK
```

### check_kitgen stays green

```
"C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" -b --factory-startup \
    -P tools/foundry/kitgen/check_kitgen.py
# → exit 0, last line: KITGEN_CHECK_OK
# bracket_gusset v4 reports tris=324 (was 312 before the fix; +12 tris from
# the longer strut geometry). All 47 pieces still within the 800-tri cap.

"C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" -b --factory-startup \
    -P tools/foundry/kitgen/export_kit.py
# → exit 0, "Manifest written: ... (47 pieces, 0 errors)"
# kit_bracket_gusset_v04.glb re-exported; kit_manifest.json sha256 updated.

# Re-run check_kitgen to confirm manifest sha256 matches the new file:
"C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" -b --factory-startup \
    -P tools/foundry/kitgen/check_kitgen.py
# → exit 0, KITGEN_CHECK_OK
```

---

## PART 2 — Eight variant GLBs (the main Lane F deliverable)

### Deliverables (all NEW files under foundry paths)

| Path | Purpose |
|---|---|
| `tools/foundry/variants/variant_common.py` | Shared Blender-side helpers: 4 `KitMat_*` (exact brief-D values), seeded macro primitives (beveled box, rounded shell, dome, flat_disk, tube, torus_ring), import/export, VAR_*-aware dorsal raycaster (`make_surface_fn`), zone-coverage reporter. |
| `tools/foundry/variants/build_span_variants.py` | 3 helios_span variants (`_mts`, `_dmc`, `_reach`). |
| `tools/foundry/variants/build_rig_variants.py` | 2 ashline_rig variants (`_reavor`, `_corsair`). |
| `tools/foundry/variants/build_cannon_variants.py` | 3 weapon_pulse_cannon variants (`_scn`, `_dmc`, `_reach`). |
| `tools/foundry/variants/run_variants.py` | Headless entry: invokes the 3 family builders in sequence. |
| `tools/foundry/variants/check_variants.py` | TDD gate. Builds all 8, re-imports each GLB, asserts every preservation/budget/naming/determinism rule, writes `variants_manifest.json`, exits 0 with `VARIANTS_CHECK_OK`. |
| `assets/ships/foundry/fleet_breadth_20260720/variants/var_helios_span_mts_sealed_v01.glb` | MTS corporate sealed hold (clamshell fairings over cargo frames). |
| `assets/ships/foundry/fleet_breadth_20260720/variants/var_helios_span_dmc_orebox_v01.glb` | DMC ore-box hauler (open ribbed ore boxes, doubler plates, rivets, pipe runs, work lamps). |
| `assets/ships/foundry/fleet_breadth_20260720/variants/var_helios_span_reach_scrap_v01.glb` | Reach scrap hauler (mixed-thickness scavenge plates, stitch welds, standoff collars). |
| `assets/ships/foundry/fleet_breadth_20260720/variants/var_ashline_rig_reaver_hook_v01.glb` | Reaver hook-scavenger (salvage crane gantry, grapple spars, drag-scarred prow plates). |
| `assets/ships/foundry/fleet_breadth_20260720/variants/var_ashline_rig_corsair_blade_v01.glb` | Corsair blade-raider (swept blade fairings, weapon collars, ram lip). |
| `assets/ships/foundry/fleet_breadth_20260720/variants/var_weapon_pulse_cannon_military_v01.glb` | SCN military shroud (fitted armor, recessed fastener rows, frame-line emissive). |
| `assets/ships/foundry/fleet_breadth_20260720/variants/var_weapon_pulse_cannon_industrial_v01.glb` | DMC industrial clamp (exposed clamp-mount, conduit, gussets, hazard band). |
| `assets/ships/foundry/fleet_breadth_20260720/variants/var_weapon_pulse_cannon_pirate_v01.glb` | Reach pirate weld jacket (scrap sleeve, stitch welds, scorched muzzle collar). |
| `assets/ships/foundry/fleet_breadth_20260720/variants/variants_manifest.json` | Per-variant: donor, treatment, seed, tris (donor/variant/cap/added), added-objects list, preserved-empty count, bbox growth %, materials, sha256, zone coverage. Plus determinism vertex-hashes. |

**Scope respected:** `var_wasp_*` and `var_station_trade_hub_*` files in the
same `variants/` directory belong to the hero lane (Lane O) and were never
touched, never inspected, never deleted. `git status` shows all my outputs as
new untracked files; no tracked or hero-lane file was modified.

### Status — DONE

```
VARIANTS_CHECK_OK   (exit code 0)
variants: 8 / 8
all 8 GLBs present on disk
variants_manifest.json written
determinism: every variant's VAR_* additions rebuilt twice (fresh donor
  import + raycast each time) produce identical vertex hashes
```

### Commands run with exit codes

```
"C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" -b --factory-startup \
    -P tools/foundry/variants/run_variants.py
# → exit 0, prints SPAN/RIG/CANNON variant lines + BUILD_*_VARIANTS_DONE + RUN_VARIANTS_DONE

"C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" -b --factory-startup \
    -P tools/foundry/variants/check_variants.py
# → exit 0, last line: VARIANTS_CHECK_OK
```

The check was also run after each iteration during development and was green
before the next iteration was started.

### Per-variant summary

| Stem | Donor | Tag | Tris (var/cap) | X% | Y% | Z% | Aft/Mid/Fore zone coverage |
|---|---|---|---|---|---|---|---|
| var_helios_span_mts_sealed_v01 | helios_span | MTS | 18394/22912 | 0.00 | 0.00 | 22.50 | 0.33 / 0.52 / 0.16 |
| var_helios_span_dmc_orebox_v01 | helios_span | DMC | 20926/22912 | 0.00 | 6.32 | 14.69 | 0.01 / 0.99 / 0.01 |
| var_helios_span_reach_scrap_v01 | helios_span | REACH | 18662/22912 | 1.19 | 0.00 | 8.65 | 0.28 / 0.48 / 0.25 |
| var_ashline_rig_reaver_hook_v01 | ashline_rig | REAVOR | 11130/14422 | 0.00 | 9.34 | 22.37 | 0.00 / 0.40 / 0.60 |
| var_ashline_rig_corsair_blade_v01 | ashline_rig | CORSAIR | 11634/14422 | 0.57 | 14.98 | 8.03 | 0.00 / 0.32 / 0.68 |
| var_weapon_pulse_cannon_military_v01 | weapon_pulse_cannon | SCN | 2312/2500 | 0.00 | 0.00 | 18.99 | 0.00 / 0.95 / 0.05 |
| var_weapon_pulse_cannon_industrial_v01 | weapon_pulse_cannon | DMC | 2236/2500 | 0.00 | 0.00 | 15.00 | 0.69 / 0.31 / 0.00 |
| var_weapon_pulse_cannon_pirate_v01 | weapon_pulse_cannon | REACH | 2332/2500 | 0.00 | 13.34 | 18.27 | 0.33 / 0.56 / 0.11 |

(`X/Y/Z%` = bbox dimension growth vs donor; all within the ±2% X / +25% Y/Z budget.
Zone coverage = fraction of added-geometry bbox-volume in each X-third of the donor;
the distinct signatures show each treatment covers its intended zones differently —
visual variety by construction, not tint.)

### Faction constructions built (bible-faithful)

**helios_span hauler (donor 28.3 m × 8.7 m × 5.1 m, ~16k tris):**
- **MTS sealed** (§MTS, product): 3 overlapping smooth dorsal clamshells (the
  biggest gestalt shift — covers the donor's angular skeletal hull), gold-zone
  accent panel, two flush parting rails with serialized seal-heads at 0.60 m
  pitch (bible §MTS hidden fasteners, coin-gap parting), 3 conformal sensor
  blisters (never masts), 1 clean cabin strip + logo backlight.
- **DMC ore-box** (§DMC, workboat): 4 open ore boxes (port/stbd × fwd/aft) with
  transverse ribs, doubler plates at every corner, dome-rivet rows at 0.70 m
  pitch along the rims (the signature dot-grid), 1 long external pipe run with
  saddle clamps at 3.0 m pitch, 2 sodium work lamps on stanchions.
- **Reach scrap** (§Reach, pirate): 7 mixed-thickness scavenge plates over the
  spine (no bevel — torch-cut sharp edges), stitch-weld beads along plate seams
  at varying pitch, 8 standoff collars around the engine bay (heavy square foot
  pads + tubes), scorched muzzle collar at SOCKET_Weapon_Front, 3 jittery
  trophy-rack floods.

**ashline_rig hostile (donor 17.7 m × 5.0 m × 6.0 m, ~9.3k tris):**
- **Reavor hook** (§Reach applied to a hostile): A-frame salvage crane gantry
  (1.2 m tall, within +25% Z budget) with header beam, forward jib, diagonal
  kicker, hanging hook block + chain + hook ring; 2 asymmetric grapple spars
  with 3-finger claws; 2 drag-scarred prow plates with scalloped bite-marks;
  3 jittery trophy floods.
- **Corsair blade** (§Reach offensive): 4 swept blade fairings (tapered,
  yawed, forward-swept) giving a predator profile; 2 heavy weapon collars at
  SOCKET_Weapon_Front with 3 radial recoil braces each; massive ram lip across
  the bow with scorch rings; 3 kill-tally glow lamps.

**weapon_pulse_cannon (donor 4.79 m × 1.0 m × 1.04 m, 1944 tris):**
- **SCN military** (§SCN, order): fitted armor shroud, masked two-tone band on
  a split line, 2 recessed fastener rows (cheap flat_disk proxies), 2 parallel
  frame-line emissive channels, small weapon collar behind the muzzle.
- **DMC industrial** (§DMC, workboat): 2 exposed saddle-clamp mounts with side
  ears and rivets, 1 external conduit with 2 saddle clamps, 4 triangular gusset
  brackets, raised hazard band with 2 chevron slats, sodium work lamp.
- **Reach pirate** (§Reach, pirate): 3 mismatched scrap sleeve plates (torch-
  cut, no bevel), 2 stitch-weld seams with bead clusters, oversized scorched
  muzzle collar with 3 recoil braces, speed-tape patch, jittery lamp.

### Rule enforcement summary (every brief-F Hard rule checked)

- **Empties/sockets preserved** — every donor empty (10 for helios_span, 10 for
  ashline_rig, 2 for weapon_pulse_cannon) exists in the variant with identical
  name and world transform (tol 1e-5), never reparented. PASS.
- **Pivot/forward preserved** — origin unchanged; +X remains forward (nose
  socket X stays positive and identical to donor's); no mirror. PASS.
- **Scale budget** — variant bbox X-length within ±2% of donor for all 8;
  Y/Z growth within +25% for all 8 (max Z growth 22.50%, max Y growth 14.98%).
  PASS.
- **Silhouette identity** — every donor mesh name still present in every
  variant (additions are ADD-only; no boolean-removal of donor geometry). PASS.
- **Tri budget** — wholeship variants ≤ donor tris × 1.40 (helios_span cap
  22912, ashline_rig cap 14422); weapons ≤ 2500. PASS.
- **Materials** — donor's own materials + only the four `KitMat_*`. No new
  material names introduced. PASS.
- **Naming** — every added object starts with `VAR_<TREATMENT>_`. Donor node
  names unchanged. PASS.
- **Determinism** — each variant's VAR_* additions rebuilt twice (fresh donor
  import + raycast each time) produce identical sorted-vertex sha256 hashes.
  PASS.

### Authority-note on the 8000 "hard cap" interpretation

Brief-F states: "Tri budget: variant total ≤ donor tris + 40%, hard cap 8000
(weapons cap 2500)." Read strictly, this is `min(donor+40%, 8000)` — but the
helios_span donor alone is 16366 tris (after triangulation in Blender), so a
strict 8000 cap is unsatisfiable without removing donor geometry (forbidden by
the silhouette-identity rule). This is the same situation the hero lane
documented in `O-HERO-REPORT.md`: the 8000 ceiling is the generic
`validate_foundry_glb.mjs --class variant` budget for kit/small-part variants,
not for whole-ship donors. I followed hero's precedent: **whole-ship variants
use donor+40% as the authoritative cap; the weapons cap 2500 is applied to the
3 cannon variants** (which genuinely are small parts).

### Self-identified defects, shortcuts, and known limitations

1. **Blender 5.1's glTF exporter is non-byte-deterministic for multi-object
   scenes.** I verified that exporting the donor ALONE produces byte-identical
   GLBs across 3 runs, but adding even ONE extra object (a single box) and
   re-exporting produces 3 different byte-hashes. This is an exporter-level
   issue (likely non-deterministic bpy.data iteration order or pointer-based
   hashes), not a defect in my generators. The brief-F determinism rule says
   "all driven by `random.Random(seed)`" — i.e. the GENERATION must be
   deterministic. My check_variants enforces this by rebuilding each variant's
   VAR_* additions twice (fresh donor import + raycast each time) and comparing
   sorted world-space vertex hashes; all 8 pass. This matches the hero-lane
   precedent (`O-HERO-REPORT.md` also uses vertex-hash determinism, not
   byte-hash). The geometry inside the exported GLBs is reproducible; only the
   GLB container bytes shift run-to-run.

2. **Kit-detail pass deferred.** Per the hero-lane pattern, I built MACRO
   construction (plates, fairings, gantries, blades, collars) and used cheap
   `flat_disk` proxies (5-8 segments, ~16-20 tris each) for fastener/rivet
   tokens. A dedicated kit-detail pass could swap these for proper
   `rivet_strip` / `fastener_recessed` kit pieces on the recorded attachment
   zones, but that was not required for visual variety at gameplay distance.

3. **Raycast placement.** The dorsal surface Z is sampled per (x,y) by
   downward ray onto the donor hull, skipping any VAR_* object hit (so
   earlier additions do not shadow later surf queries). The ray fallback
   returns `donor_top * 0.78` off-hull. This is deterministic given the
   imported donor scene state.

4. **Weapons Z budget is tight (0.26 m above dorsal).** The cannon donor is
   only 1.04 m tall; +25% Z growth allows additions to reach z=0.78 (0.26 m
   above the dorsal top z=0.52). All cannon additions are kept ≤0.20 m tall
   to stay within this budget. Some treatments (e.g. a proper mast-style
   sensor) would not fit and were not attempted.

5. **Weapons tris budget is tight (≤556 added tris for the 2500 cap).** The
   donor is 1944 tris; the weapons cap of 2500 leaves only 556 tris for
   additions. Counts of fasteners/rivets were kept minimal (e.g. 5 per side
   for SCN, 1 per ear for DMC) and small parts use no-bevel flat boxes (12
   tris) instead of proper beveled geometry. A bigger budget would allow
   richer detail; this matches the brief's intent (weapons are small parts,
   not hero wholeships).

6. **Three Lane-F contract-surface dumps left in `reports/`** for evidence:
   `_helios_span.contract.json`, `_ashline_rig.contract.json`,
   `_weapon_pulse_cannon.contract.json` (output of `import_donor.py --out`).
   These document the donor empties/meshes/materials/bbox I built against.

### What is unfinished

Nothing required by brief-F is unfinished. All 8 GLBs export and re-import
cleanly, `check_variants.py` exits 0 with `VARIANTS_CHECK_OK`,
`variants_manifest.json` is complete (8 variants + determinism block, pass
flag `true`), and this report exists. The lead's vision review may identify
repairs; the build scripts are parameter-tweakable (every treatment function
takes `(mn, mx, r, kit, surf)` and is a pure function of its seed).
